import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem, TodoFile, TodoGroup, TodoStatus } from '../models/todo';
import { TodoParser } from '../parser/todoParser';
import { TodoNode } from './todoTreeDataProvider';

/**
 * 当前项目Todo视图数据提供器 - 展示当前打开项目中的Todo文件
 */
export class CurrentProjectProvider implements vscode.TreeDataProvider<TodoNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TodoNode | undefined | null | void> = new vscode.EventEmitter<TodoNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TodoNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private todoGroups: TodoGroup[] = [];
  private nodeCache = new Map<string, TodoNode>();

  constructor() {
    this.refresh();
  }

  /**
   * 刷新树视图
   */
  public async refresh(): Promise<void> {
    this.nodeCache.clear();
    this.todoGroups = await this.findCurrentProjectTodoFiles();
    this._onDidChangeTreeData.fire();
  }

  /**
   * 查找当前项目的所有Todo文件
   * 不考虑用户设置的路径，只关注当前打开的项目
   */
  private async findCurrentProjectTodoFiles(): Promise<TodoGroup[]> {
    const groups = new Map<string, TodoGroup>();
    
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [];
    }
    
    // 获取当前活动编辑器所在的工作区文件夹
    let activeFolder = vscode.workspace.workspaceFolders[0];
    
    if (vscode.window.activeTextEditor) {
      const activeDocument = vscode.window.activeTextEditor.document;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri);
      if (workspaceFolder) {
        activeFolder = workspaceFolder;
      }
    }
    
    try {
      // 查找当前工作区文件夹中的所有.todo文件
      const todoFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(activeFolder, '**/*.todo'),
        '**/node_modules/**'
      );
      
      for (const todoFile of todoFiles) {
        const relativePath = vscode.workspace.asRelativePath(todoFile);
        const pathParts = relativePath.split(path.sep);
        
        // 使用第一级目录作为分组名（或者自定义分组策略）
        let groupName = activeFolder.name;
        if (pathParts.length > 1 && pathParts[0] !== activeFolder.name) {
          groupName = pathParts[0];
        }
        
        if (!groups.has(groupName)) {
          groups.set(groupName, { name: groupName, files: [] });
        }
        
        const todoFileObj = await TodoParser.parseTodoFile(todoFile.fsPath, groupName);
        groups.get(groupName)!.files.push(todoFileObj);
      }
    } catch (error) {
      console.error('查找当前项目Todo文件出错:', error);
    }
    
    return Array.from(groups.values());
  }

  /**
   * 获取树项元素
   * @param element 节点元素
   * @returns 树项
   */
  public getTreeItem(element: TodoNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);
    treeItem.contextValue = element.contextValue;
    
    if (element.type === 'task') {
      treeItem.command = {
        command: 'xtodo.openTodoFile',
        title: '打开文件',
        arguments: [element.file?.path, element.task?.lineNumber]
      };
      
      // 设置不同状态的图标
      if (element.task) {
        switch (element.task.status) {
          case TodoStatus.NotStarted:
            treeItem.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('xtodo.notStartedColor'));
            break;
          case TodoStatus.InProgress:
            treeItem.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('xtodo.inProgressColor'));
            break;
          case TodoStatus.Completed:
            treeItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('xtodo.completedColor'));
            break;
        }
        
        // 添加任务状态到描述中
        treeItem.description = element.task.status;
      }
    } else if (element.type === 'file') {
      treeItem.iconPath = new vscode.ThemeIcon('file');
      treeItem.description = path.basename(element.file?.path || '');
      
      // 添加文件导航命令
      if (element.file) {
        treeItem.command = {
          command: 'xtodo.openTodoFile',
          title: '打开文件',
          arguments: [element.file.path]
        };
      }
    } else if (element.type === 'group') {
      treeItem.iconPath = new vscode.ThemeIcon('folder');
    }
    
    return treeItem;
  }

  /**
   * 获取子节点
   * @param element 父节点
   * @returns 子节点数组
   */
  public getChildren(element?: TodoNode): Thenable<TodoNode[]> {
    if (!element) {
      // 根节点，显示所有分组
      const groupNodes: TodoNode[] = [];
      for (const group of this.todoGroups) {
        groupNodes.push(new TodoNode(
          group.name,
          vscode.TreeItemCollapsibleState.Expanded, // 默认展开
          'group',
          undefined,
          undefined,
          group.name
        ));
      }
      
      if (groupNodes.length === 0) {
        return Promise.resolve([
          new TodoNode(
            '当前项目中没有找到.todo文件',
            vscode.TreeItemCollapsibleState.None,
            'group'
          )
        ]);
      }
      
      return Promise.resolve(groupNodes);
    }
    
    if (element.type === 'group') {
      // 分组节点，显示该分组下的所有文件
      const fileNodes: TodoNode[] = [];
      const group = this.todoGroups.find(g => g.name === element.group);
      
      if (group) {
        for (const file of group.files) {
          fileNodes.push(new TodoNode(
            file.name,
            vscode.TreeItemCollapsibleState.Expanded, // 默认展开
            'file',
            undefined,
            file,
            group.name
          ));
        }
      }
      
      return Promise.resolve(fileNodes);
    }
    
    if (element.type === 'file' && element.file) {
      // 文件节点，显示该文件中的所有任务
      const file = element.file;
      
      // 如果文件中没有任务，显示一条提示信息
      if (file.items.length === 0) {
        const emptyNode = new TodoNode(
          '空文件，点击添加任务',
          vscode.TreeItemCollapsibleState.None,
          'task',
          undefined,
          file,
          file.group
        );
        emptyNode.command = {
          command: 'xtodo.openTodoFile',
          title: '打开文件',
          arguments: [file.path]
        };
        return Promise.resolve([emptyNode]);
      }
      
      return Promise.resolve(
        this.createTaskNodes(element.file.items, element.file)
      );
    }
    
    if (element.type === 'task' && element.task && element.task.children.length > 0) {
      // 任务节点，显示子任务
      return Promise.resolve(
        this.createTaskNodes(element.task.children, element.file as TodoFile)
      );
    }
    
    return Promise.resolve([]);
  }

  /**
   * 从任务列表创建节点
   * @param tasks 任务列表
   * @param file 所属文件
   * @returns 节点列表
   */
  private createTaskNodes(tasks: TodoItem[], file: TodoFile): TodoNode[] {
    return tasks.map(task => {
      const hasChildren = task.children && task.children.length > 0;
      const collapsibleState = hasChildren 
        ? vscode.TreeItemCollapsibleState.Expanded 
        : vscode.TreeItemCollapsibleState.None;
      
      return new TodoNode(
        task.content,
        collapsibleState,
        'task',
        task,
        file,
        file.group
      );
    });
  }
} 