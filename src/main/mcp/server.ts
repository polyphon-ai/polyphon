// MCP server module — must not import BrowserWindow or any other electron GUI dep.
// All electron-specific behavior (status push, app.quit) is injected via callbacks.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpTool } from './tools/index';
import type { McpStatus } from '../../shared/types';
import { logger } from '../utils/logger';

interface McpServerCallbacks {
  onStatusChanged?(status: McpStatus): void;
  onClose?(): void;
}

export class McpServerController {
  private server: Server | null = null;
  private transport: StdioServerTransport | null = null;
  private _running = false;
  private _headless: boolean;
  private _enabled: boolean;
  private callbacks: McpServerCallbacks;
  private tools: McpTool[];

  constructor(tools: McpTool[], enabled: boolean, headless: boolean, callbacks: McpServerCallbacks = {}) {
    this.tools = tools;
    this._enabled = enabled;
    this._headless = headless;
    this.callbacks = callbacks;
  }

  getStatus(): McpStatus {
    return {
      enabled: this._enabled,
      running: this._running,
      headless: this._headless,
      transport: 'stdio',
    };
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  // Idempotent: safe to call when already running.
  async start(): Promise<void> {
    if (this._running) return;

    this.server = new Server(
      { name: 'polyphon', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    // Register tools list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.find((t) => t.name === request.params.name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
          isError: true,
        };
      }

      try {
        logger.debug('[mcp] tool call', { tool: request.params.name });
        const result = await tool.handler(request.params.arguments ?? {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[mcp] tool call error', { tool: request.params.name, error: message });
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        };
      }
    });

    this.transport = new StdioServerTransport();

    this.transport.onclose = () => {
      logger.info('[mcp] stdio transport closed');
      this._running = false;
      this.callbacks.onStatusChanged?.(this.getStatus());
      this.callbacks.onClose?.();
    };

    this.transport.onerror = (err) => {
      logger.error('[mcp] stdio transport error', err);
    };

    await this.server.connect(this.transport);
    this._running = true;
    logger.info('[mcp] server started');
    this.callbacks.onStatusChanged?.(this.getStatus());
  }

  // Safe to call when already stopped.
  async stop(): Promise<void> {
    if (!this._running) return;
    try {
      await this.server?.close();
    } catch (err) {
      logger.warn('[mcp] error during server stop', err);
    }
    this._running = false;
    this.server = null;
    this.transport = null;
    logger.info('[mcp] server stopped');
    this.callbacks.onStatusChanged?.(this.getStatus());
  }
}
