// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TodoExplorerProvider, TodoActiveProvider, TodoNode } from './views/todoTreeDataProvider';
import { CurrentProjectProvider } from './views/currentProjectProvider';
import { TodoEditor } from './editor/todoEditor';
import { registerTodoHighlighting } from './language/todoDocumentHighlightProvider';
import { TodoFileWatcher } from './watcher/todoFileWatcher';
import * as path from 'path';
import { TodoStatus } from './models/todo';
import { loadMessages, getMessage } from './i18n/localization';
import { TodoParser } from './parser/todoParser';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// 加载多语言消息
	loadMessages(vscode.env.language);

	// 创建文件监听器
	const fileWatcher = new TodoFileWatcher();
	const watcherDisposable = fileWatcher.startWatching();
	context.subscriptions.push(watcherDisposable);

	// 注册所有任务视图
	const todoExplorerProvider = new TodoExplorerProvider();
	const todoExplorerView = vscode.window.registerTreeDataProvider(
		'todoExplorer',
		todoExplorerProvider
	);
	context.subscriptions.push(todoExplorerView);

	// 注册进行中任务视图
	const todoActiveProvider = new TodoActiveProvider();
	const todoActiveView = vscode.window.registerTreeDataProvider(
		'todoActive',
		todoActiveProvider
	);
	context.subscriptions.push(todoActiveView);

	// 注册当前项目任务视图
	const currentProjectProvider = new CurrentProjectProvider();
	const currentProjectView = vscode.window.registerTreeDataProvider(
		'todoCurrentProject',
		currentProjectProvider
	);
	context.subscriptions.push(currentProjectView);

	// 防抖动事件调度 - 控制视图更新频率
	let refreshPending = false;
	let pendingViews = new Set<string>();

	// 简化的视图刷新调度
	const scheduleRefresh = (provider: string) => {
		pendingViews.add(provider);

		if (!refreshPending) {
			refreshPending = true;
			setTimeout(() => {
				// 批量刷新所有需要更新的视图
				if (pendingViews.has('explorer')) todoExplorerProvider.refresh();
				if (pendingViews.has('active')) todoActiveProvider.refresh();
				if (pendingViews.has('current')) currentProjectProvider.refresh();

				pendingViews.clear();
				refreshPending = false;
			}, 100);  // 100ms的防抖延迟
		}
	};

	// 在文件监听器刷新时更新视图
	context.subscriptions.push(
		fileWatcher.onDidRefresh(() => {
			// 标记所有视图需要刷新
			scheduleRefresh('explorer');
			scheduleRefresh('active');
			scheduleRefresh('current');
		})
	);

	// 配置更改时清除缓存
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('xtodo')) {
				// 清除解析器缓存
				TodoParser.clearCache();
				// 清除视图提供器缓存
				todoExplorerProvider.clearCache();
				todoActiveProvider.clearCache();
				currentProjectProvider.clearCache();
				
				fileWatcher.invalidateCache();
			}
		})
	);

	// 监听编辑器切换事件，更新当前项目视图
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			scheduleRefresh('current');
		})
	);

	// 注册刷新命令
	const refreshCommand = vscode.commands.registerCommand('xtodo.refreshTodoView', () => {
		TodoParser.clearCache();
		fileWatcher.invalidateCache();
	});
	context.subscriptions.push(refreshCommand);

	// 注册切换任务状态命令
	const toggleCommand = vscode.commands.registerCommand('xtodo.toggleTodoStatus', () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			TodoEditor.toggleTaskStatus(activeEditor);
		}
	});
	context.subscriptions.push(toggleCommand);

	// 注册设置任务已完成状态命令
	const setCompletedCommand = vscode.commands.registerCommand('xtodo.setTaskCompleted', async (node?: TodoNode) => {
		if (node && node.task && node.file) {
			// 从视图中调用
			const success = await TodoEditor.updateTaskInFile(node.task, TodoStatus.Completed);
			if (!success) {
				vscode.window.showErrorMessage(getMessage('errorUpdateStatus'));
			}
		} else {
			// 从编辑器中调用
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				TodoEditor.setTaskCompleted(activeEditor);
			}
		}
	});
	context.subscriptions.push(setCompletedCommand);

	// 注册设置任务未开始状态命令
	const setNotStartedCommand = vscode.commands.registerCommand('xtodo.setTaskNotStarted', async (node?: TodoNode) => {
		if (node && node.task && node.file) {
			// 从视图中调用
			const success = await TodoEditor.updateTaskInFile(node.task, TodoStatus.NotStarted);
			if (!success) {
				vscode.window.showErrorMessage(getMessage('errorUpdateStatus'));
			}
		} else {
			// 从编辑器中调用
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				TodoEditor.setTaskNotStarted(activeEditor);
			}
		}
	});
	context.subscriptions.push(setNotStartedCommand);

	// 注册设置任务进行中状态命令
	const setInProgressCommand = vscode.commands.registerCommand('xtodo.setTaskInProgress', async (node?: TodoNode) => {
		if (node && node.task && node.file) {
			// 从视图中调用
			const success = await TodoEditor.updateTaskInFile(node.task, TodoStatus.InProgress);
			if (!success) {
				vscode.window.showErrorMessage(getMessage('errorUpdateStatus'));
			}
		} else {
			// 从编辑器中调用
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				TodoEditor.setTaskInProgress(activeEditor);
			}
		}
	});
	context.subscriptions.push(setInProgressCommand);

	// 注册打开文件命令
	const openFileCommand = vscode.commands.registerCommand(
		'xtodo.openTodoFile',
		(filePath: string, lineNumber?: number) => {
			if (filePath) {
				TodoEditor.openTodoFile(filePath, lineNumber);
			}
		}
	);
	context.subscriptions.push(openFileCommand);

	// 注册添加待办文件夹命令
	const addTodoFolderCommand = vscode.commands.registerCommand('xtodo.addTodoFolder', async () => {
		// 显示文件夹选择对话框
		const folderOptions: vscode.OpenDialogOptions = {
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: getMessage('selectTodoFolder')
		};
		
		const folderUri = await vscode.window.showOpenDialog(folderOptions);
		if (folderUri && folderUri.length > 0) {
			const folderPath = folderUri[0].fsPath;
			
			// 读取当前配置
			const config = vscode.workspace.getConfiguration('xtodo');
			let todoFolders: string[] = config.get('todoFolders', []);
			
			// 检查是否已存在此路径
			if (todoFolders.includes(folderPath)) {
				vscode.window.showInformationMessage(getMessage('folderAlreadyExists', folderPath));
				return;
			}
			
			// 尝试转为相对路径（如果在工作区内）
			let pathToAdd = folderPath;
			if (vscode.workspace.workspaceFolders) {
				for (const wsFolder of vscode.workspace.workspaceFolders) {
					const wsFolderPath = wsFolder.uri.fsPath;
					if (folderPath.startsWith(wsFolderPath)) {
						const relativePath = path.relative(wsFolderPath, folderPath);
						// 如果相对路径比绝对路径短，使用相对路径
						if (relativePath.length < folderPath.length) {
							pathToAdd = relativePath;
							break;
						}
					}
				}
			}
			
			// 更新配置
			todoFolders.push(pathToAdd);
			await config.update('todoFolders', todoFolders, vscode.ConfigurationTarget.Workspace);
			
			// 刷新视图
			vscode.window.showInformationMessage(getMessage('folderAdded', pathToAdd));
			fileWatcher.invalidateCache();
		}
	});
	context.subscriptions.push(addTodoFolderCommand);

	// 注册语法高亮
	const highlightingDisposable = registerTodoHighlighting(context);
	context.subscriptions.push(highlightingDisposable);

	// 监听文件保存，刷新视图
	const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
		if (document.fileName.endsWith('.todo')) {
			fileWatcher.invalidateCache();
			currentProjectProvider.refresh();
		}
	});
	context.subscriptions.push(onSaveDisposable);
}

export function deactivate() {
	// 清理资源
}
