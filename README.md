# XTodo

![logo](https://github.com/meteorOSS/xtodo/raw/master/resources/logo.png)

(logo 由 豆包 生成)

> A lightweight VS Code extension for managing tasks through simple text files

一款轻量级 VS Code 扩展，通过简单的文本文件管理任务

![desc](https://github.com/meteorOSS/xtodo/raw/master/resources/desc.png)

## 功能 Features

> Store global task files anywhere, with Git version control support
>
> **File Structure Management**: Organize tasks with multi-level folder structures, keeping different projects' tasks well-organized
>
> Three focused views:
>
> - **All Tasks**: Complete overview of all your todos
> - **Active Tasks**: Focus on what's in progress
> - **Current Project**: Auto-displays todos in your open workspace

- 📁 将全局的任务文件存储在任何位置，你可以使用git进行版本管理
- 📁 **文件结构管理**：支持多层级的文件夹结构组织任务，让不同项目的任务井然有序
- 📊 三个专注视图:
  - **所有任务**: 预览所有的待办
  - **进行中的任务**: 聚焦于正在进行的工作
  - **当前项目**: 当前打开项目中的.todo待办

## 工作方式 

> Create `.todo` files with simple status symbols:
>
> - ☐ Not started tasks (alt+a)
> - ■ In-progress tasks (alt+f)
> - ✔ Completed tasks (alt+d)

- 使用 `.todo` 文件，配合简单符号标记: `☐ ■ ✔`
  - ☐ 未处理的任务 (alt+q)
  - ■ 进行中的任务 (alt+f)
  - ✔ 已完成的任务 (alt+d)
- 使用快捷键或在视图中更改任务状态
- 点击任务直接导航到具体位置

## 使用方法

> Create `.todo` files with the following format:

XTodo 使用 `.todo` 后缀的纯文本文件来存储待办事项，文件结构示例：

```
☐ Task1 task:
    ✔ Subtask1
    ■ Subtask2
    ☐ Subtask3
```

并使用文件夹分类不同的任务

## 问题反馈

如有问题或建议，请提交Issues。

## 许可证

[MIT](LICENSE)
