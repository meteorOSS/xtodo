/**
 * 多语言支持模块
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// 语言消息映射
let messages: Record<string, string> = {};
const defaultLanguage = 'en';

// 支持的语言列表
const supportedLanguages = ['en', 'zh-cn'];

/**
 * 加载指定语言的消息
 * @param language 语言代码
 */
export function loadMessages(language: string): void {
  // 规范化语言代码
  const normalizedLanguage = language.toLowerCase();
  let langToUse = defaultLanguage;
  
  // 找到最接近的支持语言
  for (const supported of supportedLanguages) {
    if (normalizedLanguage === supported || normalizedLanguage.startsWith(supported + '-')) {
      langToUse = supported;
      break;
    }
  }
  
  // 初始化消息
  try {
    // 在开发环境和生产环境中可能有不同的路径结构
    // 先尝试开发环境路径
    const devPath = path.join(__dirname, '..', '..', 'src', 'i18n', `${langToUse}.json`);
    // 再尝试生产环境路径
    const prodPath = path.join(__dirname, '..', 'i18n', `${langToUse}.json`);
    
    let messagesJson: string;
    if (fs.existsSync(devPath)) {
      messagesJson = fs.readFileSync(devPath, 'utf8');
    } else if (fs.existsSync(prodPath)) {
      messagesJson = fs.readFileSync(prodPath, 'utf8');
    } else {
      // 作为后备，使用英语
      const enDevPath = path.join(__dirname, '..', '..', 'src', 'i18n', 'en.json');
      const enProdPath = path.join(__dirname, '..', 'i18n', 'en.json');
      
      if (fs.existsSync(enDevPath)) {
        messagesJson = fs.readFileSync(enDevPath, 'utf8');
      } else if (fs.existsSync(enProdPath)) {
        messagesJson = fs.readFileSync(enProdPath, 'utf8');
      } else {
        // 如果所有尝试都失败，使用硬编码英语消息
        messages = getDefaultEnglishMessages();
        return;
      }
    }
    
    messages = JSON.parse(messagesJson);
  } catch (error) {
    console.error('加载语言文件失败:', error);
    // 使用默认英语消息作为后备
    messages = getDefaultEnglishMessages();
  }
}

/**
 * 获取翻译后的消息
 * @param key 消息键
 * @param args 参数列表
 * @returns 翻译后的消息
 */
export function getMessage(key: string, ...args: any[]): string {
  let message = messages[key] || key;
  
  // 替换参数
  if (args.length > 0) {
    args.forEach((arg, index) => {
      message = message.replace(`{${index}}`, arg);
    });
  }
  
  return message;
}

/**
 * 获取默认英语消息
 * @returns 默认消息映射
 */
function getDefaultEnglishMessages(): Record<string, string> {
  return {
    'selectTodoFolder': 'Select Todo Folder',
    'folderAlreadyExists': 'Todo folder already exists: {0}',
    'folderAdded': 'Todo folder added: {0}',
    'errorUpdateStatus': 'Failed to update task status'
  };
} 