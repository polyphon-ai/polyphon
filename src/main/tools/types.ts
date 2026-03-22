export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; items?: { type: string } }>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}
