import * as vscode from 'vscode';
import * as path from 'path';
import { TodoParser } from '../parser/todoParser';
import { TodoGroup } from '../models/todo';

/**
 * Todo文件监听器，用于性能优化
 */
export class TodoFileWatcher {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private todoCache: TodoGroup[] | null = null;
  private isRefreshing = false;
  private pendingRefresh = false;
  private refreshCallbacks: Array<() => void> = [];
  
  /**
   * 开始监听Todo文件变化
   */
  public startWatching(): vscode.Disposable {
    // 创建文件系统监听器
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.todo');
    
    // 监听创建事件
    const onCreate = this.fileWatcher.onDidCreate(() => {
      this.invalidateCache();
    });
    
    // 监听更改事件
    const onChange = this.fileWatcher.onDidChange(() => {
      this.invalidateCache();
    });
    
    // 监听删除事件
    const onDelete = this.fileWatcher.onDidDelete(() => {
      this.invalidateCache();
    });
    
    return vscode.Disposable.from(
      this.fileWatcher,
      onCreate,
      onChange,
      onDelete
    );
  }
  
  /**
   * 使缓存无效
   */
  public invalidateCache(): void {
    this.todoCache = null;
    
    // 触发刷新，但避免过于频繁的刷新
    if (this.isRefreshing) {
      this.pendingRefresh = true;
      return;
    }
    
    this.refreshCache();
  }
  
  /**
   * 获取Todo分组数据，优先从缓存获取
   */
  public async getTodoGroups(): Promise<TodoGroup[]> {
    if (this.todoCache === null) {
      return this.refreshCache();
    }
    
    return this.todoCache;
  }
  
  /**
   * 刷新缓存
   * @returns 刷新后的Todo分组数据
   */
  private async refreshCache(): Promise<TodoGroup[]> {
    this.isRefreshing = true;
    this.pendingRefresh = false;
    
    try {
      this.todoCache = await TodoParser.findAllTodoFiles();
      
      // 通知所有等待刷新的回调
      this.notifyRefreshCallbacks();
      
      return this.todoCache;
    } catch (error) {
      console.error('刷新Todo缓存失败:', error);
      return [];
    } finally {
      this.isRefreshing = false;
      
      // 如果在刷新过程中有新的刷新请求，则继续刷新
      if (this.pendingRefresh) {
        this.refreshCache();
      }
    }
  }
  
  /**
   * 注册刷新回调
   * @param callback 回调函数
   */
  public onDidRefresh(callback: () => void): vscode.Disposable {
    this.refreshCallbacks.push(callback);
    
    return {
      dispose: () => {
        const index = this.refreshCallbacks.indexOf(callback);
        if (index !== -1) {
          this.refreshCallbacks.splice(index, 1);
        }
      }
    };
  }
  
  /**
   * 通知所有刷新回调
   */
  private notifyRefreshCallbacks(): void {
    for (const callback of this.refreshCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('执行刷新回调失败:', error);
      }
    }
  }
} 