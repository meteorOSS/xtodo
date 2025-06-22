import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TodoItem, TodoFile, TodoGroup, TodoStatus } from '../models/todo';

/**
 * Todo文件解析器
 */
export class TodoParser {
  /**
   * 解析单个Todo文件
   * @param filePath 文件路径
   * @param group 文件所属分组
   * @returns TodoFile对象
   */
  public static async parseTodoFile(filePath: string, group: string): Promise<TodoFile> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const items: TodoItem[] = [];
      let currentParents: TodoItem[] = [];
      
      lines.forEach((line, index) => {
        // 跳过空行
        if (line.trim() === '') {
          return;
        }

        const trimmedLine = line.trimStart();
        const indentLevel = line.length - trimmedLine.length;
        
        // 检查任务状态
        let status: TodoStatus = TodoStatus.NotStarted;
        let content = trimmedLine;
        
        if (trimmedLine.startsWith(TodoStatus.NotStarted)) {
          status = TodoStatus.NotStarted;
          content = trimmedLine.substring(TodoStatus.NotStarted.length).trim();
        } else if (trimmedLine.startsWith(TodoStatus.InProgress)) {
          status = TodoStatus.InProgress;
          content = trimmedLine.substring(TodoStatus.InProgress.length).trim();
        } else if (trimmedLine.startsWith(TodoStatus.Completed)) {
          status = TodoStatus.Completed;
          content = trimmedLine.substring(TodoStatus.Completed.length).trim();
        }
        
        // 创建任务项
        const todoItem: TodoItem = {
          content,
          status,
          children: [],
          filePath,
          lineNumber: index,
          indentLevel
        };
        
        // 根据缩进级别确定父任务
        // 清除比当前缩进级别大的父任务
        while (currentParents.length > 0 && currentParents[currentParents.length - 1].indentLevel >= indentLevel) {
          currentParents.pop();
        }
        
        if (currentParents.length === 0) {
          // 顶层任务
          items.push(todoItem);
        } else {
          // 子任务，添加到父任务的children中
          currentParents[currentParents.length - 1].children.push(todoItem);
        }
        
        // 将当前任务添加为可能的父任务
        currentParents.push(todoItem);
      });
      
      return {
        path: filePath,
        name: path.basename(filePath),
        items,
        group
      };
    } catch (error) {
      console.error(`解析文件 ${filePath} 出错:`, error);
      return {
        path: filePath,
        name: path.basename(filePath),
        items: [],
        group
      };
    }
  }
  
  /**
   * 查找并解析工作区中所有的Todo文件
   * @returns 所有的TodoGroup对象
   */
  public static async findAllTodoFiles(): Promise<TodoGroup[]> {
    const groups = new Map<string, TodoGroup>();
    
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }
    
    // 获取用户配置的待办文件夹
    const config = vscode.workspace.getConfiguration('xtodo');
    const todoFolders: string[] = config.get('todoFolders', []);
    
    // 如果没有配置待办文件夹，则搜索整个工作区
    if (todoFolders.length === 0) {
      return this.searchWorkspaceFolders(groups);
    }
    
    // 处理每个配置的文件夹
    for (const folderPath of todoFolders) {
      // 检查是否是绝对路径
      if (path.isAbsolute(folderPath)) {
        // 是绝对路径，直接使用
        await this.searchTodoFolder(groups, folderPath, path.basename(folderPath));
      } else {
        // 是相对路径，需要转为绝对路径
        for (const wsFolder of vscode.workspace.workspaceFolders) {
          const absolutePath = path.join(wsFolder.uri.fsPath, folderPath);
          await this.searchTodoFolder(groups, absolutePath, path.basename(folderPath));
        }
      }
    }
    
    return Array.from(groups.values());
  }
  
  /**
   * 搜索指定文件夹中的待办文件
   * @param groups 分组映射
   * @param folderPath 文件夹路径
   * @param defaultGroupName 默认分组名
   */
  private static async searchTodoFolder(
    groups: Map<string, TodoGroup>,
    folderPath: string,
    defaultGroupName: string
  ): Promise<void> {
    try {
      // 检查文件夹是否存在
      const stats = await fs.promises.stat(folderPath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        console.warn(`配置的待办文件夹不存在或不是一个目录: ${folderPath}`);
        return;
      }
      
      // 创建glob模式
      const folderUri = vscode.Uri.file(folderPath);
      const todoFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, '**/*.todo'),
        '**/node_modules/**'
      );
      
      for (const todoFile of todoFiles) {
        const relativePath = path.relative(folderPath, todoFile.fsPath);
        const pathParts = relativePath.split(path.sep);
        
        // 确定分组名
        let groupName = defaultGroupName;
        if (pathParts.length > 1) {
          groupName = pathParts[0];
        }
        
        if (!groups.has(groupName)) {
          groups.set(groupName, { name: groupName, files: [] });
        }
        
        const todoFileObj = await this.parseTodoFile(todoFile.fsPath, groupName);
        groups.get(groupName)!.files.push(todoFileObj);
      }
    } catch (error) {
      console.error(`搜索待办文件夹出错: ${folderPath}`, error);
    }
  }
  
  /**
   * 搜索工作区中的所有待办文件
   * @param groups 分组映射
   * @returns 所有的TodoGroup对象
   */
  private static async searchWorkspaceFolders(groups: Map<string, TodoGroup>): Promise<TodoGroup[]> {
    for (const folder of vscode.workspace.workspaceFolders!) {
      const todoFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.todo'),
        '**/node_modules/**'
      );
      
      for (const todoFile of todoFiles) {
        const relativePath = vscode.workspace.asRelativePath(todoFile);
        const pathParts = relativePath.split(path.sep);
        
        // 使用第一级目录作为分组名
        let groupName = '未分组';
        if (pathParts.length > 1) {
          groupName = pathParts[0];
        }
        
        if (!groups.has(groupName)) {
          groups.set(groupName, { name: groupName, files: [] });
        }
        
        const todoFileObj = await this.parseTodoFile(todoFile.fsPath, groupName);
        groups.get(groupName)!.files.push(todoFileObj);
      }
    }
    
    return Array.from(groups.values());
  }
  
  /**
   * 查找所有进行中的任务
   * @param groups 所有分组和文件
   * @returns 进行中的任务列表
   */
  public static findInProgressTasks(groups: TodoGroup[]): Array<{group: string, file: TodoFile, task: TodoItem}> {
    const inProgressTasks: Array<{group: string, file: TodoFile, task: TodoItem}> = [];
    
    for (const group of groups) {
      for (const file of group.files) {
        this.collectInProgressTasks(file.items, file, group.name, inProgressTasks);
      }
    }
    
    return inProgressTasks;
  }
  
  /**
   * 递归收集任务中的进行中任务
   * @param tasks 任务列表
   * @param file 所属文件
   * @param groupName 所属分组
   * @param result 结果集合
   */
  private static collectInProgressTasks(
    tasks: TodoItem[], 
    file: TodoFile, 
    groupName: string, 
    result: Array<{group: string, file: TodoFile, task: TodoItem}>
  ): void {
    for (const task of tasks) {
      if (task.status === TodoStatus.InProgress) {
        result.push({ group: groupName, file, task });
      }
      if (task.children.length > 0) {
        this.collectInProgressTasks(task.children, file, groupName, result);
      }
    }
  }
} 