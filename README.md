# VSPlugin Helper

VSPlugin Helper is a powerful extension designed for TraeIDE that enables automatic downloading and installation of VSCode official marketplace plugins. This tool bridges the gap between the VSCode marketplace and TraeIDE, making plugin management seamless and efficient.

## Features

- **One-Click Installation**: Easily install VSCode plugins directly from the official marketplace
- **Remote Installation**: Support installing plugins on remote hosts
- **Proxy Support**: Built-in proxy support for users in regions with limited access
- **Automatic Retry**: Robust retry mechanism for reliable downloads
- **Detailed Logging**: Comprehensive logging system for troubleshooting

## Installation

1. Install the extension in Trae or Trae CN
2. Configure the Trae installation path (optional)
   - Via settings: Set `vsplugin-helper.traePath`
   - Via environment: Set `TRAE_HOME` environment variable

## Usage

### Local Installation
1. Open the command palette (Ctrl+Shift+P)
2. Type and select "安装VSCode插件"
3. Enter the plugin ID (e.g., "ms-python.python")
4. Wait for the installation to complete

### Remote Installation
1. Open the command palette (Ctrl+Shift+P)
2. Type and select "安装VSCode插件(远程)"
3. Enter the plugin ID (e.g., "ms-python.python")
4. Wait for the installation to complete on the remote host

## Configuration

The extension supports the following configuration options:

- `vsplugin-helper.traePath`: Specify the Trae installation directory
  - If not set, the extension will use the `TRAE_HOME` environment variable

## Proxy Settings

The extension automatically respects system proxy settings. Set the following environment variables if needed:

- `HTTP_PROXY`
- `HTTPS_PROXY`

## Troubleshooting

Logs are stored in:
- Windows: `%USERPROFILE%\.trae-logs\plugin-installer.log`
- Linux/macOS: `~/.trae-logs/plugin-installer.log`

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues or have suggestions, please feel free to contact us via email at guanyezhui@163.com.

## Changes

### 0.0.5
- Added support for installing plugins on remote hosts
- Added new command "安装VSCode插件(远程)" for remote installation