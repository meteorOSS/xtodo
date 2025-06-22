import * as vscode from 'vscode';
import { TodoStatus } from '../models/todo';

/**
 * Todo文件语法高亮提供器
 */
export class TodoDocumentHighlightProvider implements vscode.DocumentSemanticTokensProvider {
  private readonly legend = new vscode.SemanticTokensLegend(
    ['task', 'inProgressTask', 'completedTask'],
    ['declaration']
  );

  /**
   * 获取语义标记图例
   */
  public getLegend(): vscode.SemanticTokensLegend {
    return this.legend;
  }

  /**
   * 提供语义标记
   * @param document 文档
   * @param token 取消标记
   * @returns 语义标记
   */
  public async provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    
    for (let i = 0; i < document.lineCount; i++) {
      if (token.isCancellationRequested) {
        break;
      }
      
      const line = document.lineAt(i);
      const text = line.text;
      
      // 检查任务状态
      if (text.trimStart().startsWith(TodoStatus.NotStarted)) {
        const startPos = text.indexOf(TodoStatus.NotStarted);
        builder.push(
          i, startPos, text.length - startPos,
          0, // task
          0  // declaration
        );
      } else if (text.trimStart().startsWith(TodoStatus.InProgress)) {
        const startPos = text.indexOf(TodoStatus.InProgress);
        builder.push(
          i, startPos, text.length - startPos,
          1, // inProgressTask
          0  // declaration
        );
      } else if (text.trimStart().startsWith(TodoStatus.Completed)) {
        const startPos = text.indexOf(TodoStatus.Completed);
        builder.push(
          i, startPos, text.length - startPos,
          2, // completedTask
          0  // declaration
        );
      }
    }
    
    return builder.build();
  }
}

/**
 * 注册语义高亮
 * @param context 扩展上下文
 */
export function registerTodoHighlighting(context: vscode.ExtensionContext): vscode.Disposable {
  // 获取颜色配置
  const getTaskColors = () => {
    const config = vscode.workspace.getConfiguration('xtodo');
    return {
      notStarted: config.get<string>('colors.notStarted', '#808080'),
      inProgress: config.get<string>('colors.inProgress', '#0066cc'),
      completed: config.get<string>('colors.completed', '#008000')
    };
  };
  
  // 初始颜色
  let taskColors = getTaskColors();
  
  // 注册语义标记提供器
  const highlightProvider = new TodoDocumentHighlightProvider();
  
  const semanticHighlights = vscode.languages.registerDocumentSemanticTokensProvider(
    { language: 'todo' },
    highlightProvider,
    highlightProvider.getLegend()
  );
  
  // 创建装饰类型
  const createDecorationTypes = () => {
    // 从配置中获取颜色设置
    const config = vscode.workspace.getConfiguration('xtodo');
    const notStartedColor = config.get<string>('colors.notStarted', '#808080');
    const inProgressColor = config.get<string>('colors.inProgress', '#0066cc');
    const completedColor = config.get<string>('colors.completed', '#008000');
    
    const notStartedDecorationType = vscode.window.createTextEditorDecorationType({
      color: notStartedColor,
      fontWeight: 'normal'
    });
    
    const inProgressDecorationType = vscode.window.createTextEditorDecorationType({
      color: inProgressColor,
      fontWeight: 'bold'
    });
    
    const completedDecorationType = vscode.window.createTextEditorDecorationType({
      color: completedColor,
      textDecoration: 'line-through'
    });
    
    return { notStartedDecorationType, inProgressDecorationType, completedDecorationType };
  };
  
  // 初始化装饰类型
  let decorationTypes = createDecorationTypes();
  
  // 注册装饰更新
  const updateDecoration = (editor: vscode.TextEditor) => {
    if (!editor || editor.document.languageId !== 'todo') {
      return;
    }
    
    const notStartedLines: vscode.DecorationOptions[] = [];
    const inProgressLines: vscode.DecorationOptions[] = [];
    const completedLines: vscode.DecorationOptions[] = [];
    
    const document = editor.document;
    
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text;
      
      if (text.trimStart().startsWith(TodoStatus.NotStarted)) {
        const startPos = text.indexOf(TodoStatus.NotStarted);
        const range = new vscode.Range(
          i, startPos,
          i, text.length
        );
        notStartedLines.push({ range });
      } else if (text.trimStart().startsWith(TodoStatus.InProgress)) {
        const startPos = text.indexOf(TodoStatus.InProgress);
        const range = new vscode.Range(
          i, startPos,
          i, text.length
        );
        inProgressLines.push({ range });
      } else if (text.trimStart().startsWith(TodoStatus.Completed)) {
        const startPos = text.indexOf(TodoStatus.Completed);
        const range = new vscode.Range(
          i, startPos,
          i, text.length
        );
        completedLines.push({ range });
      }
    }
    
    editor.setDecorations(decorationTypes.notStartedDecorationType, notStartedLines);
    editor.setDecorations(decorationTypes.inProgressDecorationType, inProgressLines);
    editor.setDecorations(decorationTypes.completedDecorationType, completedLines);
  };
  
  // 监听配置变化，更新颜色
  const onConfigurationChanged = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('xtodo.colors')) {
      taskColors = getTaskColors();
      
      // 重新创建装饰类型
      decorationTypes = createDecorationTypes();
      
      // 更新所有打开的编辑器
      vscode.window.visibleTextEditors.forEach(editor => {
        if (editor.document.languageId === 'todo') {
          updateDecoration(editor);
        }
      });
    }
  });
  
  // 监听活动编辑器变化
  const onActiveEditorChanged = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      updateDecoration(editor);
    }
  });
  
  // 监听文档变化
  const onDocumentChanged = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecoration(editor);
    }
  });
  
  // 初始化当前编辑器
  if (vscode.window.activeTextEditor) {
    updateDecoration(vscode.window.activeTextEditor);
  }
  
  // 返回所有注册的可处置对象
  return vscode.Disposable.from(
    semanticHighlights,
    onActiveEditorChanged, 
    onDocumentChanged,
    onConfigurationChanged
  );
} 