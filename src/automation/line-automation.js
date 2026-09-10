import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { MacOSLineAutomation } from './macos-line-automation.js';
import { WindowsLineAutomation } from './windows-line-automation.js';
import { withLineOperation } from './line-operation-lock.mjs';
// CODEX_LINE_WORKFLOW_GUARDS_V1

export class LineAutomation {
  constructor() {
    this.platform = process.platform;
        
    if (this.platform === 'darwin') {
      this.automation = new MacOSLineAutomation();
    } else if (this.platform === 'win32') {
      this.automation = new WindowsLineAutomation();
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async switchToEnglish() {
    return await this.automation.switchToEnglish();
  }

  async selectChat(chatName) {
    return await this.automation.selectChat(chatName);
  }

  async copyAllChatToClipboard() {
    return await this.automation.copyAllChatToClipboard();
  }

  async pageUp(times = 2) {
    return await this.automation.pageUp(times);
  }

  async runOperation(kind, action) {
    return this.platform === 'win32' ? withLineOperation(kind, action) : action();
  }

  async getChatHistory(chatName, date, messageLimit = 100, pageUpTimes = 10) {
    return this.runOperation('history-read', async () => {
      const history = await this._getChatHistory(chatName, date, messageLimit, pageUpTimes);
      if (this.platform === 'win32' && (typeof history !== 'string' || !history.trim() || history.trim().startsWith('ERROR:'))) {
        const error = new Error('HISTORY_READ_FAILED: LINE did not return chat text. Do not treat this as empty history or retry blindly.');
        error.code = 'HISTORY_READ_FAILED';
        throw error;
      }
      return history;
    });
  }

  async _getChatHistory(chatName, date, messageLimit = 100, pageUpTimes = 10) {

    await this.automation.switchToEnglish();
    const activation = await this.automation.activateLine();
    if (this.platform === 'win32' && activation?.success !== true) {
      const error = new Error('LINE_FOCUS_UNAVAILABLE: LINE activation was not verified.');
      error.code = 'LINE_FOCUS_UNAVAILABLE';
      throw error;
    }
    const ok = await this.automation.selectChat(chatName);

    if (!ok) throw new Error(`Chat "${chatName}" not found`);

    await this.automation.pageUp(pageUpTimes);

    const chatHistory = await this.automation.copyAllChatToClipboard();

    if ( process.env.CHAT_LOG_ON==='true' ) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Remove only filesystem-unsafe characters, preserve CJK characters
        const safeChatName = chatName.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_');
        const fileName = `${safeChatName}_${timestamp}.txt`;
        
        let logDir = '';

        if( process.env.CHAT_LOG_PATH ) {
           logDir = process.env.CHAT_LOG_PATH;
        }
        else
        {
           logDir = path.join(process.cwd(), 'logs');
        }

        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        const logFilePath = path.join(logDir, fileName);
        fs.writeFileSync(logFilePath, chatHistory);
        console.error(`Chat history saved to ${logFilePath}`);
      } catch (error) {
        console.error('Failed to write chat history to log file:', error);
      }
    }

    return chatHistory;
  }

  async sendChatMessage(chatName, message, autoSend = false) {
    return this.runOperation('send-text', () => this._sendChatMessage(chatName, message, autoSend));
  }

  async _sendChatMessage(chatName, message, autoSend = false) {

    await this.automation.switchToEnglish();
    const activation = await this.automation.activateLine();
    if (this.platform === 'win32' && activation?.success !== true) {
      const error = new Error('LINE_FOCUS_UNAVAILABLE: LINE activation was not verified.');
      error.code = 'LINE_FOCUS_UNAVAILABLE';
      throw error;
    }
    const ok = await this.automation.selectChat(chatName);
    if (!ok) throw new Error(`Chat "${chatName}" not found`);

    return await this.automation.sendMessage(chatName, message, autoSend);
  }

  async stageFileManual(chatName, filePath, optionalMessage = '') {
    return this.runOperation('stage-file', () => this._stageFileManual(chatName, filePath, optionalMessage));
  }

  async _stageFileManual(chatName, filePath, optionalMessage = '') {

    await this.automation.switchToEnglish();
    const activation = await this.automation.activateLine();
    if (this.platform === 'win32' && activation?.success !== true) {
      const error = new Error('LINE_FOCUS_UNAVAILABLE: LINE activation was not verified.');
      error.code = 'LINE_FOCUS_UNAVAILABLE';
      throw error;
    }
    const ok = await this.automation.selectChat(chatName);
    if (!ok) throw new Error(`Chat "${chatName}" not found`);

    if (!this.automation.stageFileManual) {
      throw new Error(`File attachment is not implemented for platform: ${this.platform}`);
    }

    if (optionalMessage) {
      const messageResult = await this.automation.sendMessage(chatName, optionalMessage, false);
      if (!messageResult.success) {
        return messageResult;
      }
    }

    return await this.automation.stageFileManual(filePath);
  }

  async getChatList(includeGroups = true, includeIndividual = true) {
    return await this.automation.getChatList(includeGroups, includeIndividual);
  }

  async isLineRunning() {
    return await this.automation.isLineRunning();
  }

  async activateLine() {
    return await this.automation.activateLine();
  }
}
