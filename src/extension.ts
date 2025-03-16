import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

// 创建日志记录函数
function logToFile(message: string) {
    const logDir = path.join(os.homedir(), '.trae-logs');
    const logFile = path.join(logDir, 'plugin-installer.log');
    
    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 添加时间戳到日志消息
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // 追加写入日志文件
    fs.appendFileSync(logFile, logMessage);
}

// 检查是否支持远程安装
async function checkRemoteSupport() {
    if (!vscode.env.remoteName) {
        throw new Error('请先使用SSH Remote插件连接到远程主机');
    }
    return true;
}

export async function activate(context: vscode.ExtensionContext) {
    // 添加配置变更监听
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('vsplugin-helper.traePath')) {
                logToFile('Trae安装路径配置已更新');
            }
        })
    );

    // 注册插件安装命令
    let disposable = vscode.commands.registerCommand('vsplugin-helper.installPlugin', async () => {
        try {
            // 获取用户输入的插件ID
            const pluginId = await vscode.window.showInputBox({
                placeHolder: '请输入VSCode插件的ID（例如：ms-python.python）',
                prompt: '输入插件ID'
            });

            if (!pluginId) {
                return;
            }

            logToFile(`开始安装插件: ${pluginId}`);
            vscode.window.showInformationMessage(`开始安装插件: ${pluginId}`);

            // 从VSCode市场获取插件信息
            vscode.window.showInformationMessage('正在从VSCode市场获取插件信息...');
            const marketplaceUrl = `https://marketplace.visualstudio.com/items?itemName=${pluginId}`;
            logToFile(`正在获取插件信息，URL: ${marketplaceUrl}`);
            // 创建axios实例，添加重试配置和代理支持
            const axiosInstance = axios.create({
                timeout: 30000, // 30秒超时
                proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? {
                    protocol: 'http',
                    host: process.env.HTTP_PROXY?.split('://')[1]?.split(':')[0] || process.env.HTTPS_PROXY?.split('://')[1]?.split(':')[0] || '',
                    port: parseInt(process.env.HTTP_PROXY?.split(':').pop() || process.env.HTTPS_PROXY?.split(':').pop() || '0')
                } : null,
                maxRetries: 3, // 最大重试次数
                retryDelay: 1000, // 重试间隔（毫秒）
            });

            // 添加重试拦截器
            axiosInstance.interceptors.response.use(undefined, async (err) => {
                const config = err.config;
                if (!config || !config.maxRetries) return Promise.reject(err);
                
                config.retryCount = config.retryCount || 0;
                if (config.retryCount >= config.maxRetries) {
                    return Promise.reject(err);
                }
                
                config.retryCount += 1;
                logToFile(`请求失败，正在进行第 ${config.retryCount} 次重试...`);
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                return axiosInstance(config);
            });

            const response = await axiosInstance.get(marketplaceUrl);

            if (!response.data) {
                throw new Error('未找到插件');
            }

            // 解析HTML获取最新版本号
            const versionMatch = response.data.match(/"VersionValue":"([^"]+)"/);            if (!versionMatch) {
                throw new Error('无法获取插件版本信息');
            }

            const latestVersion = versionMatch[1];
            const [publisher, extensionName] = pluginId.split('.');
            
            logToFile(`获取到插件版本: ${latestVersion}`);

            // 构建下载URL
            const vsixUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${latestVersion}/vspackage`;
            logToFile(`插件下载URL: ${vsixUrl}`);

            vscode.window.showInformationMessage('正在下载插件...');

            // 下载插件
            const vsixResponse = await axiosInstance.get(vsixUrl, { responseType: 'arraybuffer' });
            // 获取临时目录
            const tempDir = path.join(os.tmpdir(), 'vsplugin-helper');
            const vsixPath = path.join(tempDir, `${pluginId}.vsix`);

            // 确保临时目录存在
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 保存插件文件
            fs.writeFileSync(vsixPath, vsixResponse.data);
            logToFile(`插件文件已保存到: ${vsixPath}`);

            vscode.window.showInformationMessage('正在安装插件...');

            // 使用trae命令行工具安装插件
            try {
                // 获取trae安装目录，优先使用配置项
                const config = vscode.workspace.getConfiguration('vsplugin-helper');
                const configTraePath = config.get<string>('traePath');
                const isRemote = vscode.env.remoteName !== undefined;
                let traeInstallPath = configTraePath || process.env.TRAE_HOME;

                // 在远程环境下，如果未配置traePath，则使用当前工作目录
                if (isRemote && !traeInstallPath) {
                    traeInstallPath = process.cwd();
                    logToFile('远程环境下使用当前工作目录作为Trae安装目录');
                } else if (!traeInstallPath) {
                    throw new Error('未找到Trae安装路径，请在设置中配置或设置TRAE_HOME环境变量');
                }

                logToFile(`使用Trae安装目录: ${traeInstallPath}`);

                // 检查是否在远程环境中
                logToFile(`当前环境: ${isRemote ? '远程' : '本地'}`);

                // 保存当前工作目录
                const currentDir = process.cwd();
                
                // 切换到trae的bin目录
                const traeBinPath = path.join(traeInstallPath, 'bin');
                process.chdir(traeBinPath);
                logToFile(`切换到Trae bin目录: ${traeBinPath}`);

                // 根据环境选择安装命令
                const installCommand = isRemote ? 
                    `trae --install-extension "${vsixPath}" --remote` :
                    `trae --install-extension "${vsixPath}"`;

                // 执行trae命令安装插件
                const { stdout, stderr } = await execAsync(installCommand);
                logToFile(`安装命令输出: ${stdout}`);
                
                // 切换回原来的目录
                process.chdir(currentDir);

                if (stderr) {
                    throw new Error(stderr);
                }

                // 安装成功后清理临时文件
                fs.unlinkSync(vsixPath);
                logToFile(`安装成功，已清理临时文件: ${vsixPath}`);

                vscode.window.showInformationMessage(`插件 ${pluginId} 安装成功！`);
                logToFile(`插件 ${pluginId} 安装完成`);
            } catch (error) {
                // 如果安装失败，也需要清理临时文件
                if (fs.existsSync(vsixPath)) {
                    fs.unlinkSync(vsixPath);
                    logToFile(`安装失败，已清理临时文件: ${vsixPath}`);
                }
                logToFile(`安装失败: ${error.message}`);
                throw new Error(`插件安装失败: ${error.message}`);
            }
        } catch (error) {
            logToFile(`发生错误: ${error.message}`);
            vscode.window.showErrorMessage(`安装插件失败: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);

    // 注册远程安装命令
    let remoteDisposable = vscode.commands.registerCommand('vsplugin-helper.installRemotePlugin', async () => {
        try {
            // 检查远程支持
            await checkRemoteSupport();

            // 获取用户输入的插件ID
            const pluginId = await vscode.window.showInputBox({
                placeHolder: '请输入VSCode插件的ID（例如：ms-python.python）',
                prompt: '输入插件ID'
            });

            if (!pluginId) {
                return;
            }

            logToFile(`开始远程安装插件: ${pluginId}`);
            vscode.window.showInformationMessage(`开始远程安装插件: ${pluginId}`);

            // 从VSCode市场获取插件信息
            vscode.window.showInformationMessage('正在从VSCode市场获取插件信息...');
            const marketplaceUrl = `https://marketplace.visualstudio.com/items?itemName=${pluginId}`;
            logToFile(`正在获取插件信息，URL: ${marketplaceUrl}`);

            const axiosInstance = axios.create({
                timeout: 30000,
                proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? {
                    protocol: 'http',
                    host: process.env.HTTP_PROXY?.split('://')[1]?.split(':')[0] || process.env.HTTPS_PROXY?.split('://')[1]?.split(':')[0] || '',
                    port: parseInt(process.env.HTTP_PROXY?.split(':').pop() || process.env.HTTPS_PROXY?.split(':').pop() || '0')
                } : null,
                maxRetries: 3,
                retryDelay: 1000
            });

            const response = await axiosInstance.get(marketplaceUrl);

            if (!response.data) {
                throw new Error('未找到插件');
            }

            // 解析HTML获取最新版本号
            const versionMatch = response.data.match(/"VersionValue":"([^"]+)"/);
            if (!versionMatch) {
                throw new Error('无法获取插件版本信息');
            }

            const latestVersion = versionMatch[1];
            const [publisher, extensionName] = pluginId.split('.');
            
            logToFile(`获取到插件版本: ${latestVersion}`);

            // 构建下载URL
            const vsixUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${latestVersion}/vspackage`;
            logToFile(`插件下载URL: ${vsixUrl}`);

            vscode.window.showInformationMessage('正在下载插件...');

            // 下载插件
            const vsixResponse = await axiosInstance.get(vsixUrl, { responseType: 'arraybuffer' });
            const tempDir = path.join(os.tmpdir(), 'vsplugin-helper');
            const vsixPath = path.join(tempDir, `${pluginId}.vsix`);

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            fs.writeFileSync(vsixPath, vsixResponse.data);
            logToFile(`插件文件已保存到: ${vsixPath}`);

            vscode.window.showInformationMessage('正在远程安装插件...');

            try {
                // 创建隐藏终端
                let terminal = vscode.window.createTerminal({
                    name: 'VSPlugin Helper',
                    hideFromUser: true
                });

                // 使用进度提示
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `正在安装插件 ${pluginId}`,
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: '准备安装环境...' });
                    
                    // 在远程主机上创建临时目录
                    const remoteDir = '/tmp/vsplugin-helper';
                    terminal.sendText(`mkdir -p ${remoteDir}`);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    progress.report({ message: '传输插件文件...' });
                    // 使用VSCode的远程文件系统API复制文件
                    const remoteVsixPath = path.posix.join(remoteDir, `${pluginId}.vsix`);
                    const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(vsixPath));
                    await vscode.workspace.fs.writeFile(
                        vscode.Uri.parse(`vscode-remote://${vscode.env.remoteName}${remoteVsixPath}`),
                        fileContent
                    );

                    progress.report({ message: '执行安装...' });
                    // 在远程主机上执行安装命令
                    terminal.sendText(`trae --install-extension "${remoteVsixPath}"`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    progress.report({ message: '清理临时文件...' });
                    terminal.sendText(`rm -f "${remoteVsixPath}"`);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // 清理本地临时文件
                    fs.unlinkSync(vsixPath);
                    logToFile(`安装成功，已清理临时文件: ${vsixPath}`);

                    // 关闭终端
                    terminal.dispose();
                });

                vscode.window.showInformationMessage(`插件 ${pluginId} 远程安装成功！`);
                logToFile(`插件 ${pluginId} 远程安装完成`);
            } catch (error) {
                if (fs.existsSync(vsixPath)) {
                    fs.unlinkSync(vsixPath);
                    logToFile(`安装失败，已清理临时文件: ${vsixPath}`);
                }
                logToFile(`安装失败: ${error.message}`);
                throw new Error(`插件远程安装失败: ${error.message}`);
            }
        } catch (error) {
            logToFile(`发生错误: ${error.message}`);
            vscode.window.showErrorMessage(`远程安装插件失败: ${error.message}`);
        }
    });

    context.subscriptions.push(remoteDisposable);
}

export function deactivate() {}
