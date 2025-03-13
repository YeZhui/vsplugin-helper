const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 读取package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// 检查版本号格式
function validateVersion(version) {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return versionRegex.test(version);
}

// 检查是否有未提交的更改
function checkGitStatus() {
    try {
        const status = execSync('git status --porcelain').toString();
        if (status) {
            console.error('错误：有未提交的更改，请先提交或存储更改。');
            process.exit(1);
        }
    } catch (error) {
        console.error('错误：无法检查git状态。', error.message);
        process.exit(1);
    }
}

// 读取Open VSX token
function getOVSXToken() {
    const tokenPath = path.join(process.env.USERPROFILE || process.env.HOME, '.ovsx', 'token');
    try {
        if (fs.existsSync(tokenPath)) {
            return fs.readFileSync(tokenPath, 'utf8').trim();
        }
    } catch (error) {
        console.error('无法读取Open VSX token文件');
    }
    return process.env.OVSX_TOKEN;
}

async function publish() {
    console.log('开始发布流程...');

    // 检查版本号
    if (!validateVersion(packageJson.version)) {
        console.error(`错误：无效的版本号 ${packageJson.version}`);
        process.exit(1);
    }

    // 检查git状态
    checkGitStatus();

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
        process.env.OVSX_TOKEN = token;
        execSync('npm run ovsx:publish', { stdio: 'inherit' });

        // 创建git标签
        console.log(`正在创建git标签 v${packageJson.version}...`);
        execSync(`git tag -a v${packageJson.version} -m "Release ${packageJson.version}"`);
        execSync('git push --tags');

        console.log('\n✨ 发布成功！');
        console.log(`版本: ${packageJson.version}`);
    } catch (error) {
        console.error('发布过程中出现错误:', error.message);
        process.exit(1);
    }
}

publish();