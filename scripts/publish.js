const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 读取package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// 获取插件的vsix文件名
function getVsixFileName() {
    return `${packageJson.publisher}-${packageJson.name}-${packageJson.version}.vsix`;
}

// 检查版本号格式
function validateVersion(version) {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return versionRegex.test(version);
}

// 读取Open VSX token
function getOVSXToken() {
    // 首先尝试从项目根目录读取token
    const projectTokenPath = path.join(process.cwd(), '.ovsx', 'token');
    try {
        if (fs.existsSync(projectTokenPath)) {
            return fs.readFileSync(projectTokenPath, 'utf8').trim();
        }
    } catch (error) {
        console.error('无法读取项目目录下的Open VSX token文件');
    }

    // 如果项目目录下没有token，尝试从用户目录读取
    const userTokenPath = path.join(process.env.USERPROFILE || process.env.HOME, '.ovsx', 'token');
    try {
        if (fs.existsSync(userTokenPath)) {
            return fs.readFileSync(userTokenPath, 'utf8').trim();
        }
    } catch (error) {
        console.error('无法读取用户目录下的Open VSX token文件');
    }

    return process.env.OVSX_TOKEN;
}

async function buildAndMove() {
    console.log('开始构建流程...');

    // 检查版本号
    if (!validateVersion(packageJson.version)) {
        console.error(`错误：无效的版本号 ${packageJson.version}`);
        process.exit(1);
    }

    try {
        // 清理和构建
        console.log('正在构建项目...');
        execSync('npm run package', { stdio: 'inherit' });

        // 打包vsix
        console.log('正在打包vsix...');
        const vsixFile = getVsixFileName();
        execSync(`npx vsce package --out "${vsixFile}" --baseContentUrl https://github.com/YeZhui/vsplugin-helper --baseImagesUrl https://github.com/YeZhui/vsplugin-helper`, { stdio: 'inherit' });

        // 移动vsix文件
        //const vsixFile = getVsixFileName();
        const sourcePath = path.join(process.cwd(), vsixFile);
        const targetDir = 'D:\\Programs\\Trae\\bin';
        const targetPath = path.join(targetDir, vsixFile);

        // 检查源文件是否存在
        if (!fs.existsSync(sourcePath)) {
            console.error(`错误：未找到构建生成的vsix文件: ${sourcePath}`);
            process.exit(1);
        }

        // 检查目标目录是否存在
        if (!fs.existsSync(targetDir)) {
            console.error(`错误：目标目录 ${targetDir} 不存在`);
            process.exit(1);
        }

        // 确保目标文件不存在
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
        }

        // 复制文件
        console.log(`正在移动vsix文件到: ${targetPath}`);
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);

        // 自动安装插件
        console.log('正在安装插件...');
        process.chdir(targetDir);
        execSync('trae --install-extension "' + vsixFile + '"', { stdio: 'inherit' });

        console.log('\n✨ 构建并安装成功！');
        console.log(`插件已移动到并安装: ${targetPath}`);
    } catch (error) {
        console.error('构建过程中出现错误:', error.message);
        process.exit(1);
    }
}

if (process.argv[2] === '--build-only') {
    buildAndMove();
} else {
    async function publish() {
        console.log('开始发布流程...');

        // 检查版本号
        if (!validateVersion(packageJson.version)) {
            console.error(`错误：无效的版本号 ${packageJson.version}`);
            process.exit(1);
        }

        // 获取Open VSX token
        const token = getOVSXToken();
        if (!token) {
            console.error('错误：未找到Open VSX token。请设置OVSX_TOKEN环境变量或在~/.ovsx/token中配置。');
            process.exit(1);
        }

        try {
            // 清理和构建
            console.log('正在构建项目...');
            execSync('npm run package', { stdio: 'inherit' });

            // 发布到Open VSX
            console.log('正在发布到Open VSX...');
            execSync('npx ovsx publish --pat ' + token, { stdio: 'inherit' });

            console.log('\n✨ 发布成功！');
            console.log(`版本: ${packageJson.version}`);
        } catch (error) {
            console.error('发布过程中出现错误:', error.message);
            process.exit(1);
        }
    }

    publish();
}