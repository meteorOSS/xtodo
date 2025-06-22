import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem, TodoFile, TodoGroup, TodoStatus } from '../models/todo';
import { TodoParser } from '../parser/todoParser';

/**
 * 表示树视图中的一个节点
 */
export class TodoNode {
  public readonly contextValue: string;
  
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'group' | 'file' | 'task',
    public readonly task?: TodoItem,
    public readonly file?: TodoFile,
    public readonly group?: string,
    public readonly children?: TodoNode[]
  ) {
    // 设置上下文值，用于条件菜单显示
    this.contextValue = type;
  }
}

/**
 * 所有任务树视图数据提供器
 */
export class TodoExplorerProvider implements vscode.TreeDataProvider<TodoNode> {
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
    this.todoGroups = await TodoParser.findAllTodoFiles();
    this._onDidChangeTreeData.fire();
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
            treeItem.iconPath = new vscode.ThemeIcon('circle-outline');
            break;
          case TodoStatus.InProgress:
            treeItem.iconPath = new vscode.ThemeIcon('play-circle');
            break;
          case TodoStatus.Completed:
            treeItem.iconPath = new vscode.ThemeIcon('check');
            break;
        }
        
        // 添加任务状态到描述中
        treeItem.description = element.task.status;
      }
    } else if (element.type === 'file') {
      treeItem.iconPath = new vscode.ThemeIcon('file');
      treeItem.description = path.basename(element.file?.path || '');
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
          vscode.TreeItemCollapsibleState.Collapsed,
          'group',
          undefined,
          undefined,
          group.name
        ));
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
            vscode.TreeItemCollapsibleState.Collapsed,
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
        ? vscode.TreeItemCollapsibleState.Collapsed 
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

/**
 * 进行中任务视图数据提供器
 */
export class TodoActiveProvider implements vscode.TreeDataProvider<TodoNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TodoNode | undefined | null | void> = new vscode.EventEmitter<TodoNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TodoNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private todoGroups: TodoGroup[] = [];
  private activeTasksCache: Array<{group: string, file: TodoFile, task: TodoItem}> = [];

  constructor() {
    this.refresh();
  }

  /**
   * 刷新树视图
   */
  public async refresh(): Promise<void> {
    this.todoGroups = await TodoParser.findAllTodoFiles();
    this.activeTasksCache = TodoParser.findInProgressTasks(this.todoGroups);
    this._onDidChangeTreeData.fire();
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
      
      treeItem.iconPath = new vscode.ThemeIcon('play-circle');
      treeItem.description = `${element.file?.name}`;
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
      // 根节点，按分组组织进行中的任务
      const groups = new Map<string, TodoNode[]>();
      
      // 先创建所有分组
      for (const {group} of this.activeTasksCache) {
        if (!groups.has(group)) {
          groups.set(group, []);
        }
      }
      
      // 如果没有进行中的任务，显示提示信息
      if (groups.size === 0) {
        const emptyNode = new TodoNode(
          '没有进行中的任务',
          vscode.TreeItemCollapsibleState.None,
          'task'
        );
        return Promise.resolve([emptyNode]);
      }
      
      // 返回分组节点
      return Promise.resolve(
        Array.from(groups.keys()).map(groupName => new TodoNode(
          groupName,
          vscode.TreeItemCollapsibleState.Expanded,
          'group',
          undefined,
          undefined,
          groupName
        ))
      );
    }
    
    if (element.type === 'group') {
      // 分组节点，显示该分组下进行中的任务
      const taskNodes: TodoNode[] = [];
      
      for (const {group, file, task} of this.activeTasksCache) {
        if (group === element.group) {
          taskNodes.push(new TodoNode(
            task.content,
            vscode.TreeItemCollapsibleState.None,
            'task',
            task,
            file,
            group
          ));
        }
      }
      
      return Promise.resolve(taskNodes);
    }
    
    return Promise.resolve([]);
  }
} 