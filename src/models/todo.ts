/**
 * 任务状态枚举
 */
export enum TodoStatus {
  NotStarted = '☐',
  InProgress = '■',
  Completed = '✔'
}

/**
 * Todo任务接口
 */
export interface TodoItem {
  /** 任务内容 */
  content: string;
  /** 任务状态 */
  status: TodoStatus;
  /** 子任务 */
  children: TodoItem[];
  /** 所在文件路径 */
  filePath?: string;
  /** 所在行号 */
  lineNumber?: number;
  /** 任务的缩进级别 */
  indentLevel: number;
}

/**
 * 表示一个Todo文件
 */
export interface TodoFile {
  /** 文件路径 */
  path: string;
  /** 文件名 */
  name: string;
  /** 文件中的任务 */
  items: TodoItem[];
  /** 文件所属分组 */
  group: string;
}

/**
 * 表示一个分组
 */
export interface TodoGroup {
  /** 分组名称 */
  name: string;
  /** 分组中的Todo文件 */
  files: TodoFile[];
} 