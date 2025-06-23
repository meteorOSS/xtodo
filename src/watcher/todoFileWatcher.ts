import * as vscode from 'vscode';
import * as path from 'path';
import { TodoParser } from '../parser/todoParser';
import { TodoGroup } from '../models/todo';

/**
 * Todo文件监听器，用于性能优化
 */
export class TodoFileWatcher {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private todoCache: Map<string, TodoGroup> = new Map(); // 按分组名缓存
  private isRefreshing = false;
  private pendingRefresh = false;
  private refreshCallbacks: Array<() => void> = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly DEBOUNCE_DELAY = 300; // 防抖动延迟ms
  
  /**
   * 开始监听Todo文件变化
   */
  public startWatching(): vscode.Disposable {
    // 创建文件系统监听器
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.todo');
    
    // 监听创建事件 - 只刷新受影响的文件
    const onCreate = this.fileWatcher.onDidCreate(uri => {
      this.invalidateCacheForFile(uri.fsPath);
    });
    
    // 监听更改事件 - 只刷新受影响的文件
    const onChange = this.fileWatcher.onDidChange(uri => {
      this.invalidateCacheForFile(uri.fsPath);
    });
    
    // 监听删除事件 - 只刷新受影响的文件
    const onDelete = this.fileWatcher.onDidDelete(uri => {
      this.invalidateCacheForFile(uri.fsPath);
    });
    
    return vscode.Disposable.from(
      this.fileWatcher,
      onCreate,
      onChange,
      onDelete
    );
  }
  
  /**
   * 使指定文件的缓存无效
   * @param filePath 文件路径
   */
  public invalidateCacheForFile(filePath: string): void {
    // 使用防抖动，避免短时间内频繁刷新
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      // 标记需要刷新，但不立即刷新
      if (this.isRefreshing) {
        this.pendingRefresh = true;
        return;
      }
      
      this.refreshCache();
    }, this.DEBOUNCE_DELAY);
  }
  
  /**
   * 使所有缓存无效（完全刷新）
   */
  public invalidateCache(): void {
    this.todoCache.clear();
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
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
    if (this.todoCache.size === 0) {
      return this.refreshCache();
    }
    
    return Array.from(this.todoCache.values());
  }
  
  /**
   * 刷新缓存
   * @returns 刷新后的Todo分组数据
   */
  private async refreshCache(): Promise<TodoGroup[]> {
    this.isRefreshing = true;
    this.pendingRefresh = false;
    
    try {
      const groups = await TodoParser.findAllTodoFiles();
      
      // 更新缓存
      this.todoCache.clear();
      for (const group of groups) {
        this.todoCache.set(group.name, group);
      }
      
      // 通知所有等待刷新的回调
      this.notifyRefreshCallbacks();
      
      return groups;
    } catch (error) {
      console.error('刷新Todo缓存失败:', error);
      return [];
    } finally {
      this.isRefreshing = false;
      
      // 如果在刷新过程中有新的刷新请求，则继续刷新
      if (this.pendingRefresh) {
        setTimeout(() => this.refreshCache(), 0);
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
    // 使用requestAnimationFrame来推迟UI更新，减少UI阻塞
    setTimeout(() => {
      for (const callback of this.refreshCallbacks) {
        try {
          callback();
        } catch (error) {
          console.error('执行刷新回调失败:', error);
        }
      }
    }, 0);
  }
} 