import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem, TodoFile, TodoGroup, TodoStatus } from '../models/todo';
import { TodoParser } from '../parser/todoParser';

/**
 * 获取任务状态对应的颜色
 */
export function getTaskStatusColor(status: TodoStatus): string {
  const config = vscode.workspace.getConfiguration('xtodo');
  switch (status) {
    case TodoStatus.NotStarted:
      return config.get<string>('colors.notStarted', '#808080');
    case TodoStatus.InProgress:
      return config.get<string>('colors.inProgress', '#0066cc');
    case TodoStatus.Completed:
      return config.get<string>('colors.completed', '#008000');
    default:
      return '#000000';
  }
}

/**
 * 表示树视图中的一个节点
 */
export class TodoNode {
  public readonly contextValue: string;
  public command?: {
    command: string;
    title: string;
    arguments: any[];
  };
  
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

  // 使用 WeakMap 存储节点缓存，避免内存泄漏
  private nodeCache = new WeakMap<TodoFile | TodoItem, TodoNode>();
  // 轻量级的分组节点缓存
  private groupNodeCache = new Map<string, TodoNode>();
  private todoGroups: TodoGroup[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly REFRESH_DELAY = 50; // 防抖刷新时间

  constructor() {
    this.refresh();
  }

  /**
   * 刷新树视图 - 使用防抖动避免频繁刷新
   */
  public refresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    this.refreshTimer = setTimeout(async () => {
      try {
        this.todoGroups = await TodoParser.findAllTodoFiles();
        this._onDidChangeTreeData.fire();
      } catch (error) {
        console.error("刷新树视图失败:", error);
      }
    }, this.REFRESH_DELAY);
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
      
      // 设置不同状态的图标和颜色
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
        
        // 添加任务状态到描述中并设置颜色
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
   * 获取子节点 - 使用缓存和懒加载
   * @param element 父节点
   * @returns 子节点数组
   */
  public getChildren(element?: TodoNode): Thenable<TodoNode[]> {
    if (!element) {
      // 根节点，显示所有分组
      const groupNodes: TodoNode[] = [];
      for (const group of this.todoGroups) {
        // 尝试从缓存获取
        let groupNode = this.groupNodeCache.get(group.name);
        if (!groupNode) {
          groupNode = new TodoNode(
            group.name,
            vscode.TreeItemCollapsibleState.Collapsed,
            'group',
            undefined,
            undefined,
            group.name
          );
          this.groupNodeCache.set(group.name, groupNode);
        }
        groupNodes.push(groupNode);
      }
      
      // 如果没有任何分组，显示空状态
      if (groupNodes.length === 0) {
        return Promise.resolve([
          new TodoNode(
            '没有找到.todo文件',
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
          // 尝试从缓存获取
          let fileNode = this.getNodeFromCache(file);
          if (!fileNode) {
            fileNode = new TodoNode(
              file.name,
              vscode.TreeItemCollapsibleState.Collapsed,
              'file',
              undefined,
              file,
              group.name
            );
            this.setCacheNode(file, fileNode);
          }
          fileNodes.push(fileNode);
        }
      }
      
      return Promise.resolve(fileNodes);
    }
    
    if (element.type === 'file' && element.file) {
      // 文件节点，显示该文件中的所有任务
      const file = element.file;
      
      // 添加文件导航命令，即使文件为空也能点击打开
      if (!element.command) {
        element.command = {
          command: 'xtodo.openTodoFile',
          title: '打开文件',
          arguments: [file.path]
        };
      }
      
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
        // 确保空文件提示节点也能打开文件
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
      // 尝试从缓存获取
      let taskNode = this.getNodeFromCache(task);
      if (!taskNode) {
        const hasChildren = task.children && task.children.length > 0;
        const collapsibleState = hasChildren 
          ? vscode.TreeItemCollapsibleState.Collapsed 
          : vscode.TreeItemCollapsibleState.None;
        
        taskNode = new TodoNode(
          task.content,
          collapsibleState,
          'task',
          task,
          file,
          file.group
        );
        this.setCacheNode(task, taskNode);
      }
      return taskNode;
    });
  }

  /**
   * 从缓存中获取节点
   */
  private getNodeFromCache(key: TodoFile | TodoItem): TodoNode | undefined {
    return this.nodeCache.get(key);
  }

  /**
   * 设置节点缓存
   */
  private setCacheNode(key: TodoFile | TodoItem, node: TodoNode): void {
    this.nodeCache.set(key, node);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.nodeCache = new WeakMap();
    this.groupNodeCache.clear();
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
  private nodeCache = new WeakMap<TodoItem, TodoNode>();
  private groupNodeCache = new Map<string, TodoNode>();
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly REFRESH_DELAY = 50; // 防抖刷新时间

  constructor() {
    this.refresh();
  }

  /**
   * 刷新树视图 - 使用防抖动避免频繁刷新
   */
  public refresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    this.refreshTimer = setTimeout(async () => {
      try {
        this.todoGroups = await TodoParser.findAllTodoFiles();
        this.activeTasksCache = TodoParser.findInProgressTasks(this.todoGroups);
        this._onDidChangeTreeData.fire();
      } catch (error) {
        console.error("刷新进行中任务视图失败:", error);
      }
    }, this.REFRESH_DELAY);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.nodeCache = new WeakMap();
    this.groupNodeCache.clear();
  }

  /**
   * 从缓存中获取节点
   */
  private getNodeFromCache(key: TodoItem): TodoNode | undefined {
    return this.nodeCache.get(key);
  }

  /**
   * 设置节点缓存
   */
  private setCacheNode(key: TodoItem, node: TodoNode): void {
    this.nodeCache.set(key, node);
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
      
      treeItem.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('xtodo.inProgressColor'));
      treeItem.description = `${element.file?.name}`;
    } else if (element.type === 'group') {
      treeItem.iconPath = new vscode.ThemeIcon('folder');
    } else if (element.type === 'file') {
      treeItem.iconPath = new vscode.ThemeIcon('file');
      
      // 添加文件导航命令
      if (element.file) {
        treeItem.command = {
          command: 'xtodo.openTodoFile',
          title: '打开文件',
          arguments: [element.file.path]
        };
      }
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
      const groupMap = new Map<string, string[]>();
      
      // 先创建所有分组
      for (const {group} of this.activeTasksCache) {
        if (!groupMap.has(group)) {
          groupMap.set(group, []);
        }
      }
      
      // 如果没有进行中的任务，显示提示信息
      if (groupMap.size === 0) {
        const emptyNode = new TodoNode(
          '没有进行中的任务',
          vscode.TreeItemCollapsibleState.None,
          'task'
        );
        return Promise.resolve([emptyNode]);
      }
      
      // 返回分组节点
      return Promise.resolve(
        Array.from(groupMap.keys()).map(groupName => {
          // 尝试从缓存获取
          let groupNode = this.groupNodeCache.get(groupName);
          if (!groupNode) {
            groupNode = new TodoNode(
              groupName,
              vscode.TreeItemCollapsibleState.Expanded,
              'group',
              undefined,
              undefined,
              groupName
            );
            this.groupNodeCache.set(groupName, groupNode);
          }
          return groupNode;
        })
      );
    }
    
    if (element.type === 'group') {
      // 分组节点，显示该分组下进行中的任务
      const taskNodes: TodoNode[] = [];
      
      for (const {group, file, task} of this.activeTasksCache) {
        if (group === element.group) {
          // 尝试从缓存获取
          let taskNode = this.getNodeFromCache(task);
          if (!taskNode) {
            // 检查任务是否有子任务
            const hasChildren = task.children && task.children.length > 0;
            const collapsibleState = hasChildren 
              ? vscode.TreeItemCollapsibleState.Collapsed 
              : vscode.TreeItemCollapsibleState.None;
              
            taskNode = new TodoNode(
              task.content,
              collapsibleState,
              'task',
              task,
              file,
              group
            );
            this.setCacheNode(task, taskNode);
          }
          taskNodes.push(taskNode);
        }
      }
      
      return Promise.resolve(taskNodes);
    }
    
    // 检查是否是任务节点，并且有子任务
    if (element.type === 'task' && element.task && element.task.children.length > 0) {
      // 寻找该任务的所有进行中子任务
      const childTasks: TodoNode[] = [];
      
      for (const childTask of element.task.children) {
        if (childTask.status === TodoStatus.InProgress || this.hasInProgressChildren(childTask)) {
          // 尝试从缓存获取
          let childNode = this.getNodeFromCache(childTask);
          if (!childNode) {
            // 检查任务是否有子任务
            const hasChildren = childTask.children && childTask.children.length > 0;
            const collapsibleState = hasChildren 
              ? vscode.TreeItemCollapsibleState.Collapsed 
              : vscode.TreeItemCollapsibleState.None;
              
            childNode = new TodoNode(
              childTask.content,
              collapsibleState,
              'task',
              childTask,
              element.file,
              element.group
            );
            this.setCacheNode(childTask, childNode);
          }
          childTasks.push(childNode);
        }
      }
      
      return Promise.resolve(childTasks);
    }
    
    return Promise.resolve([]);
  }

  private hasInProgressChildren(task: TodoItem): boolean {
    if (task.children && task.children.length > 0) {
      for (const childTask of task.children) {
        if (childTask.status === TodoStatus.InProgress || this.hasInProgressChildren(childTask)) {
          return true;
        }
      }
    }
    return false;
  }
} 