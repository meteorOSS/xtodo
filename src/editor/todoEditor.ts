import * as vscode from 'vscode';
import { TodoItem, TodoStatus } from '../models/todo';
import { getMessage } from '../i18n/localization';

/**
 * Todo编辑器辅助类
 */
export class TodoEditor {
  /**
   * 获取当前行的任务状态
   * @param line 当前行文本
   * @returns 任务状态
   */
  public static getTaskStatus(line: string): TodoStatus | undefined {
    const trimmedLine = line.trimStart();
    
    if (trimmedLine.startsWith(TodoStatus.NotStarted)) {
      return TodoStatus.NotStarted;
    } else if (trimmedLine.startsWith(TodoStatus.InProgress)) {
      return TodoStatus.InProgress;
    } else if (trimmedLine.startsWith(TodoStatus.Completed)) {
      return TodoStatus.Completed;
    }
    
    return undefined;
  }
  
  /**
   * 切换任务状态
   * @param editor 编辑器
   */
  public static toggleTaskStatus(editor: vscode.TextEditor): void {
    const document = editor.document;
    
    // 确保是todo文件
    if (document.languageId !== 'todo') {
      vscode.window.showErrorMessage(getMessage('onlyInTodoFile'));
      return;
    }
    
    // 获取当前光标位置
    const position = editor.selection.active;
    const line = document.lineAt(position.line);
    const lineText = line.text;
    
    // 获取当前任务状态
    const currentStatus = this.getTaskStatus(lineText);
    if (currentStatus === undefined) {
      vscode.window.showInformationMessage(getMessage('notValidTask'));
      return;
    }
    
    // 获取下一个状态
    const nextStatus = this.getNextStatus(currentStatus);
    
    // 设置新状态
    this.updateTaskStatus(editor, line, currentStatus, nextStatus);
  }

  /**
   * 将任务设置为已完成状态
   * @param editor 编辑器
   */
  public static setTaskCompleted(editor: vscode.TextEditor): void {
    this.setSpecificStatus(editor, TodoStatus.Completed);
  }

  /**
   * 将任务设置为未开始状态
   * @param editor 编辑器
   */
  public static setTaskNotStarted(editor: vscode.TextEditor): void {
    this.setSpecificStatus(editor, TodoStatus.NotStarted);
  }

  /**
   * 将任务设置为进行中状态
   * @param editor 编辑器
   */
  public static setTaskInProgress(editor: vscode.TextEditor): void {
    this.setSpecificStatus(editor, TodoStatus.InProgress);
  }

  /**
   * 设置任务为特定状态
   * @param editor 编辑器
   * @param newStatus 新状态
   */
  private static setSpecificStatus(editor: vscode.TextEditor, newStatus: TodoStatus): void {
    const document = editor.document;
    
    // 确保是todo文件
    if (document.languageId !== 'todo') {
      vscode.window.showErrorMessage(getMessage('onlyInTodoFile'));
      return;
    }
    
    // 获取当前光标位置
    const position = editor.selection.active;
    const line = document.lineAt(position.line);
    const lineText = line.text;
    
    // 获取当前任务状态
    const currentStatus = this.getTaskStatus(lineText);
    if (currentStatus === undefined) {
      vscode.window.showInformationMessage(getMessage('notValidTask'));
      return;
    }
    
    // 如果当前状态已经是目标状态，设置为对应的相反状态
    if (currentStatus === newStatus) {
      let oppositeStatus: TodoStatus;
      
      // 确定对应的相反状态
      switch (currentStatus) {
        case TodoStatus.Completed:
          // 已完成状态设置为进行中
          oppositeStatus = TodoStatus.InProgress;
          break;
        case TodoStatus.InProgress:
          // 进行中状态设置为未开始
          oppositeStatus = TodoStatus.NotStarted;
          break;
        case TodoStatus.NotStarted:
          // 未开始状态设置为进行中
          oppositeStatus = TodoStatus.InProgress;
          break;
        default:
          oppositeStatus = TodoStatus.NotStarted;
      }
      
      // 设置为相反状态
      this.updateTaskStatus(editor, line, currentStatus, oppositeStatus);
      return;
    }
    
    // 设置新状态
    this.updateTaskStatus(editor, line, currentStatus, newStatus);
  }
  
  /**
   * 更新任务状态
   * @param editor 编辑器
   * @param line 当前行
   * @param currentStatus 当前状态
   * @param newStatus 新状态
   */
  private static updateTaskStatus(
    editor: vscode.TextEditor, 
    line: vscode.TextLine, 
    currentStatus: TodoStatus, 
    newStatus: TodoStatus
  ): void {
    // 计算缩进
    const lineText = line.text;
    const indentMatch = lineText.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    
    // 提取任务内容
    const taskContent = lineText.substring(
      lineText.indexOf(currentStatus) + currentStatus.length
    ).trim();
    
    // 创建新行
    const newLine = `${indent}${newStatus} ${taskContent}`;
    
    // 更新文本
    editor.edit(editBuilder => {
      editBuilder.replace(line.range, newLine);
    }).then(success => {
      if (success) {
        // 通知任务状态已更改
        vscode.commands.executeCommand('xtodo.refreshTodoView');
      }
    });
  }
  
  /**
   * 获取下一个任务状态
   * @param currentStatus 当前状态
   * @returns 下一个状态
   */
  private static getNextStatus(currentStatus: TodoStatus): TodoStatus {
    switch (currentStatus) {
      case TodoStatus.NotStarted:
        return TodoStatus.InProgress;
      case TodoStatus.InProgress:
        return TodoStatus.Completed;
      case TodoStatus.Completed:
        return TodoStatus.NotStarted;
      default:
        return TodoStatus.NotStarted;
    }
  }
  
  /**
   * 打开Todo文件并定位到指定行
   * @param filePath 文件路径
   * @param lineNumber 行号
   */
  public static async openTodoFile(filePath: string, lineNumber?: number): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);
      
      if (lineNumber !== undefined) {
        // 跳转到指定行
        const position = new vscode.Position(lineNumber, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(getMessage('cannotOpenFile', error));
    }
  }

  /**
   * 更新任务状态（通过TodoItem对象）
   * @param task 任务对象
   * @param newStatus 新状态
   */
  public static async updateTaskInFile(task: TodoItem, newStatus: TodoStatus): Promise<boolean> {
    if (!task.filePath || task.lineNumber === undefined) {
      return false;
    }

    try {
      // 打开文件
      const document = await vscode.workspace.openTextDocument(task.filePath);
      
      // 确保行号有效
      if (task.lineNumber >= document.lineCount) {
        return false;
      }

      // 获取任务行
      const line = document.lineAt(task.lineNumber);
      const lineText = line.text;
      
      // 获取当前任务状态
      const currentStatus = this.getTaskStatus(lineText);
      if (currentStatus === undefined) {
        return false;
      }
      
      // 计算缩进
      const indentMatch = lineText.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      
      // 提取任务内容
      const taskContent = lineText.substring(
        lineText.indexOf(currentStatus) + currentStatus.length
      ).trim();
      
      // 创建新行
      const newLine = `${indent}${newStatus} ${taskContent}`;
      
      // 应用编辑
      const editor = await vscode.window.showTextDocument(document);
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(line.range, newLine);
      });
      
      if (success) {
        // 保存文件
        await document.save();
        // 通知任务状态已更改
        vscode.commands.executeCommand('xtodo.refreshTodoView');
      }
      
      return success;
    } catch (error) {
      console.error('更新任务状态失败:', error);
      return false;
    }
  }
} 