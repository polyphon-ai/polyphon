interface OpenRpcMethodParam {
  name: string;
  description: string;
  required: boolean;
  schema: Record<string, unknown>;
}

interface OpenRpcMethodResult {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
}

interface OpenRpcMethod {
  name: string;
  summary: string;
  description: string;
  params: OpenRpcMethodParam[];
  result: OpenRpcMethodResult;
}

interface OpenRpcSpec {
  openrpc: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ name: string; url: string; description?: string }>;
  methods: OpenRpcMethod[];
  components: {
    schemas: Record<string, unknown>;
  };
}

export function buildOpenRpcSpec(version: string): OpenRpcSpec {
  return {
    openrpc: '1.3.0',
    info: {
      title: 'Polyphon TCP API',
      version,
      description:
        'JSON-RPC 2.0 API for controlling Polyphon over a local TCP connection. ' +
        'All methods except api.authenticate require prior authentication.',
    },
    servers: [
      {
        name: 'local',
        url: 'tcp://127.0.0.1:7432',
        description: 'Default local TCP server. Port is configurable via POLYPHON_API_PORT.',
      },
    ],
    methods: [
      // ---- api namespace ----
      {
        name: 'api.authenticate',
        summary: 'Authenticate with the API server',
        description:
          'Must be called first on every new TCP connection before any other method. ' +
          'Pass the token from the api.key file in the Polyphon app data directory. ' +
          'Returns -32001 UNAUTHORIZED on failure.',
        params: [
          {
            name: 'token',
            description: 'The API bearer token.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'AuthenticateResult',
          schema: { $ref: '#/components/schemas/AuthenticateResult' },
        },
      },
      {
        name: 'api.getStatus',
        summary: 'Get API server status',
        description: 'Returns runtime status of the API server including port, host, and version.',
        params: [],
        result: {
          name: 'ApiStatus',
          schema: { $ref: '#/components/schemas/ApiStatus' },
        },
      },
      {
        name: 'api.getSpec',
        summary: 'Get the OpenRPC spec document',
        description:
          'Returns this OpenRPC 1.3 document describing the complete TCP API surface. ' +
          'The info.version field reflects the running app version. ' +
          'Does not require authentication.',
        params: [],
        result: {
          name: 'OpenRpcSpec',
          description: 'The full OpenRPC 1.3 document for this API.',
          schema: { type: 'object', additionalProperties: true },
        },
      },

      // ---- compositions namespace ----
      {
        name: 'compositions.list',
        summary: 'List compositions',
        description: 'Returns all compositions, optionally including archived ones.',
        params: [
          {
            name: 'archived',
            description: 'If true, include archived compositions. Defaults to false.',
            required: false,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'compositions',
          schema: { type: 'array', items: { $ref: '#/components/schemas/Composition' } },
        },
      },
      {
        name: 'compositions.get',
        summary: 'Get a composition by ID',
        description: 'Returns the composition with the given ID. Returns -32002 NOT_FOUND if the ID does not exist.',
        params: [
          {
            name: 'id',
            description: 'The composition UUID.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'composition',
          schema: { $ref: '#/components/schemas/Composition' },
        },
      },
      {
        name: 'compositions.create',
        summary: 'Create a composition',
        description: 'Creates a new composition with the given voices and settings.',
        params: [
          {
            name: 'name',
            description: 'Display name for the composition.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'mode',
            description: 'Conversation mode: conductor (routed) or broadcast (all voices respond).',
            required: true,
            schema: { type: 'string', enum: ['conductor', 'broadcast'] },
          },
          {
            name: 'continuationPolicy',
            description: 'Controls whether the conversation continues automatically.',
            required: true,
            schema: { type: 'string', enum: ['none', 'prompt', 'auto'] },
          },
          {
            name: 'continuationMaxRounds',
            description: 'Maximum number of automatic continuation rounds.',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'voices',
            description: 'Ordered array of voice configurations.',
            required: true,
            schema: { type: 'array', items: { $ref: '#/components/schemas/CompositionVoiceInput' } },
          },
        ],
        result: {
          name: 'composition',
          schema: { $ref: '#/components/schemas/Composition' },
        },
      },
      {
        name: 'compositions.update',
        summary: 'Update a composition',
        description: 'Partially updates a composition. Only provided fields are changed.',
        params: [
          {
            name: 'id',
            description: 'The composition UUID to update.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'data',
            description: 'Partial composition data to apply.',
            required: true,
            schema: { type: 'object' },
          },
        ],
        result: {
          name: 'composition',
          schema: { $ref: '#/components/schemas/Composition' },
        },
      },
      {
        name: 'compositions.delete',
        summary: 'Delete a composition',
        description: 'Permanently deletes a composition and all its voices. Returns -32002 NOT_FOUND if not found.',
        params: [
          {
            name: 'id',
            description: 'The composition UUID to delete.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'result',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },
      {
        name: 'compositions.archive',
        summary: 'Archive or unarchive a composition',
        description: 'Sets the archived flag on a composition. Archived compositions are hidden by default.',
        params: [
          {
            name: 'id',
            description: 'The composition UUID.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'archived',
            description: 'True to archive, false to unarchive.',
            required: true,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'result',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },

      // ---- sessions namespace ----
      {
        name: 'sessions.list',
        summary: 'List sessions',
        description: 'Returns all sessions, optionally including archived ones.',
        params: [
          {
            name: 'archived',
            description: 'If true, include archived sessions. Defaults to false.',
            required: false,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'sessions',
          schema: { type: 'array', items: { $ref: '#/components/schemas/Session' } },
        },
      },
      {
        name: 'sessions.get',
        summary: 'Get a session by ID',
        description: 'Returns the session with the given ID. Returns -32002 NOT_FOUND if not found.',
        params: [
          {
            name: 'id',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'session',
          schema: { $ref: '#/components/schemas/Session' },
        },
      },
      {
        name: 'sessions.create',
        summary: 'Create a session from a composition',
        description:
          'Creates a new conversation session from the given composition. ' +
          'The composition defines which voices participate and how they interact.',
        params: [
          {
            name: 'compositionId',
            description: 'The UUID of the composition to base the session on.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'source',
            description: 'Identifier for the caller creating the session (e.g. "polyphon", "poly-cli", "mcp"). Max 64 chars.',
            required: true,
            schema: { type: 'string', maxLength: 64 },
          },
          {
            name: 'name',
            description: "Optional display name. Defaults to today's date.",
            required: false,
            schema: { type: 'string' },
          },
          {
            name: 'workingDir',
            description: 'Optional filesystem path used as the working directory for tool-use.',
            required: false,
            schema: { type: 'string', nullable: true },
          },
          {
            name: 'sandboxedToWorkingDir',
            description: 'If true, path-based tools are constrained to workingDir.',
            required: false,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'session',
          schema: { $ref: '#/components/schemas/Session' },
        },
      },
      {
        name: 'sessions.delete',
        summary: 'Delete a session',
        description: 'Permanently deletes a session and all its messages.',
        params: [
          {
            name: 'id',
            description: 'The session UUID to delete.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'result',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },
      {
        name: 'sessions.rename',
        summary: 'Rename a session',
        description: 'Updates the display name of an existing session.',
        params: [
          {
            name: 'id',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'name',
            description: 'New display name for the session.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'session',
          schema: { $ref: '#/components/schemas/Session' },
        },
      },
      {
        name: 'sessions.archive',
        summary: 'Archive or unarchive a session',
        description: 'Sets the archived flag on a session.',
        params: [
          {
            name: 'id',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'archived',
            description: 'True to archive, false to unarchive.',
            required: true,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'result',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },
      {
        name: 'sessions.messages',
        summary: 'List messages in a session',
        description: 'Returns all messages in the session in chronological order.',
        params: [
          {
            name: 'sessionId',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'messages',
          schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
        },
      },
      {
        name: 'sessions.export',
        summary: 'Export a session transcript',
        description: 'Exports the full conversation transcript in the requested format.',
        params: [
          {
            name: 'sessionId',
            description: 'The session UUID to export.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'format',
            description: 'Export format.',
            required: true,
            schema: { type: 'string', enum: ['markdown', 'json', 'plaintext'] },
          },
        ],
        result: {
          name: 'ExportResult',
          schema: { $ref: '#/components/schemas/ExportResult' },
        },
      },

      // ---- voice namespace ----
      {
        name: 'voice.broadcast',
        summary: 'Send a message to all voices in a session',
        description:
          'Sends a conductor message to all voices in the session and collects their responses. ' +
          'When stream is true, voice tokens are emitted as stream.chunk notifications before the final response.',
        params: [
          {
            name: 'sessionId',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'content',
            description: 'The message text to broadcast.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'stream',
            description: 'If true, emit stream.chunk notifications as tokens arrive.',
            required: false,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'BroadcastResult',
          schema: { $ref: '#/components/schemas/BroadcastResult' },
        },
      },
      {
        name: 'voice.ask',
        summary: 'Send a message to a specific voice',
        description:
          'Sends a message directly to one voice in the session and returns its response. ' +
          'When stream is true, tokens are emitted as stream.chunk notifications.',
        params: [
          {
            name: 'sessionId',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'voiceId',
            description: 'The voice UUID within the session.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'content',
            description: 'The message text to send.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'stream',
            description: 'If true, emit stream.chunk notifications as tokens arrive.',
            required: false,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'AskResult',
          schema: { $ref: '#/components/schemas/AskResult' },
        },
      },
      {
        name: 'voice.abort',
        summary: 'Abort in-progress voice responses',
        description: 'Cancels any in-progress voice requests for the given session.',
        params: [
          {
            name: 'sessionId',
            description: 'The session UUID.',
            required: true,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'AbortResult',
          schema: { type: 'object', properties: { aborted: { type: 'boolean' } }, required: ['aborted'] },
        },
      },

      // ---- search namespace ----
      {
        name: 'search.messages',
        summary: 'Full-text search across messages',
        description: 'Searches message content using SQLite FTS5. Optionally scoped to a single session.',
        params: [
          {
            name: 'query',
            description: 'The search query string.',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'sessionId',
            description: 'Optional session UUID to restrict the search.',
            required: false,
            schema: { type: 'string' },
          },
        ],
        result: {
          name: 'messages',
          schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
        },
      },

      // ---- settings namespace ----
      {
        name: 'settings.getProviderStatus',
        summary: 'Get voice provider status',
        description: 'Returns configuration and availability status for all registered voice providers.',
        params: [],
        result: {
          name: 'providers',
          schema: { type: 'array', items: { $ref: '#/components/schemas/ProviderStatus' } },
        },
      },
      {
        name: 'settings.getDebugInfo',
        summary: 'Get application debug information',
        description: 'Returns diagnostic information including app version, platform, and environment.',
        params: [],
        result: {
          name: 'debugInfo',
          schema: { $ref: '#/components/schemas/DebugInfo' },
        },
      },
      {
        name: 'settings.getUserProfile',
        summary: 'Get the conductor profile',
        description: 'Returns the conductor display name, color, avatar, and pronouns.',
        params: [],
        result: {
          name: 'userProfile',
          schema: { $ref: '#/components/schemas/UserProfilePublic' },
        },
      },

      // ---- mcp namespace ----
      {
        name: 'mcp.getStatus',
        summary: 'Get MCP server status',
        description: 'Returns the current status of the built-in MCP (Model Context Protocol) server.',
        params: [],
        result: {
          name: 'mcpStatus',
          schema: { $ref: '#/components/schemas/McpStatus' },
        },
      },
      {
        name: 'mcp.setEnabled',
        summary: 'Enable or disable the MCP server',
        description: 'Toggles the built-in MCP server on or off.',
        params: [
          {
            name: 'enabled',
            description: 'True to enable, false to disable.',
            required: true,
            schema: { type: 'boolean' },
          },
        ],
        result: {
          name: 'mcpStatus',
          schema: { $ref: '#/components/schemas/McpStatus' },
        },
      },
    ],
    components: {
      schemas: {
        AuthenticateResult: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
          },
          required: ['ok'],
        },
        ApiStatus: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            remoteAccessEnabled: { type: 'boolean' },
            running: { type: 'boolean' },
            port: { type: 'integer' },
            host: { type: 'string' },
            tokenFingerprint: { type: 'string' },
            version: { type: 'string' },
            activeConnections: { type: 'integer' },
            startupError: { type: 'string' },
          },
          required: ['enabled', 'remoteAccessEnabled', 'running', 'port', 'host', 'tokenFingerprint', 'version', 'activeConnections'],
        },
        Composition: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            mode: { type: 'string', enum: ['conductor', 'broadcast'] },
            continuationPolicy: { type: 'string', enum: ['none', 'prompt', 'auto'] },
            continuationMaxRounds: { type: 'integer' },
            voices: { type: 'array', items: { $ref: '#/components/schemas/CompositionVoice' } },
            createdAt: { type: 'integer' },
            updatedAt: { type: 'integer' },
            archived: { type: 'boolean' },
          },
          required: ['id', 'name', 'mode', 'continuationPolicy', 'continuationMaxRounds', 'voices', 'createdAt', 'updatedAt', 'archived'],
        },
        CompositionVoice: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            provider: { type: 'string' },
            model: { type: 'string' },
            cliCommand: { type: 'string' },
            cliArgs: { type: 'array', items: { type: 'string' } },
            displayName: { type: 'string' },
            systemPrompt: { type: 'string' },
            toneOverride: { type: 'string' },
            systemPromptTemplateId: { type: 'string' },
            order: { type: 'integer' },
            color: { type: 'string' },
            avatarIcon: { type: 'string' },
            customProviderId: { type: 'string' },
            enabledTools: { type: 'array', items: { type: 'string' } },
            yoleModeOverride: { type: 'boolean', nullable: true },
          },
          required: ['id', 'provider', 'displayName', 'order', 'color', 'avatarIcon'],
        },
        CompositionVoiceInput: {
          type: 'object',
          description: 'Voice configuration when creating or updating a composition.',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            cliCommand: { type: 'string' },
            cliArgs: { type: 'array', items: { type: 'string' } },
            displayName: { type: 'string' },
            systemPrompt: { type: 'string' },
            toneOverride: { type: 'string' },
            systemPromptTemplateId: { type: 'string' },
            order: { type: 'integer' },
            color: { type: 'string' },
            avatarIcon: { type: 'string' },
            customProviderId: { type: 'string' },
            enabledTools: { type: 'array', items: { type: 'string' } },
          },
          required: ['provider', 'displayName', 'order', 'color', 'avatarIcon'],
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            compositionId: { type: 'string' },
            name: { type: 'string' },
            mode: { type: 'string', enum: ['conductor', 'broadcast'] },
            continuationPolicy: { type: 'string', enum: ['none', 'prompt', 'auto'] },
            continuationMaxRounds: { type: 'integer' },
            source: { type: 'string' },
            workingDir: { type: 'string', nullable: true },
            sandboxedToWorkingDir: { type: 'boolean' },
            createdAt: { type: 'integer' },
            updatedAt: { type: 'integer' },
            archived: { type: 'boolean' },
          },
          required: ['id', 'compositionId', 'name', 'mode', 'continuationPolicy', 'continuationMaxRounds', 'source', 'sandboxedToWorkingDir', 'createdAt', 'updatedAt', 'archived'],
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sessionId: { type: 'string' },
            role: { type: 'string', enum: ['conductor', 'voice', 'system'] },
            voiceId: { type: 'string', nullable: true },
            voiceName: { type: 'string', nullable: true },
            content: { type: 'string' },
            timestamp: { type: 'integer' },
            roundIndex: { type: 'integer' },
          },
          required: ['id', 'sessionId', 'role', 'content', 'timestamp', 'roundIndex'],
        },
        ExportResult: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['content', 'format'],
        },
        BroadcastResult: {
          type: 'object',
          properties: {
            messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
          },
          required: ['messages'],
        },
        AskResult: {
          type: 'object',
          properties: {
            message: { $ref: '#/components/schemas/Message' },
          },
          required: ['message'],
        },
        ProviderStatus: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            apiKeyStatus: { $ref: '#/components/schemas/ApiKeyStatus' },
            cliStatus: { $ref: '#/components/schemas/CliStatus', nullable: true },
          },
          required: ['provider', 'apiKeyStatus'],
        },
        ApiKeyStatus: {
          type: 'object',
          description: 'API key resolution result. `status` is "specific" (provider-specific env var), "fallback" (canonical env var), or "none" (no key found).',
          properties: {
            status: { type: 'string', enum: ['specific', 'fallback', 'none'] },
            varName: { type: 'string' },
            maskedKey: { type: 'string' },
            specificVar: { type: 'string' },
            fallbackVar: { type: 'string' },
          },
          required: ['status'],
        },
        CliStatus: {
          type: 'object',
          properties: {
            available: { type: 'boolean' },
            command: { type: 'string' },
            path: { type: 'string' },
            error: { type: 'string' },
          },
          required: ['available'],
        },
        DebugInfo: {
          type: 'object',
          properties: {
            appVersion: { type: 'string' },
            schemaVersion: { type: 'integer' },
            platform: { type: 'string' },
            arch: { type: 'string' },
          },
          required: ['appVersion', 'schemaVersion', 'platform', 'arch'],
        },
        McpStatus: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            running: { type: 'boolean' },
            headless: { type: 'boolean' },
            transport: { type: 'string', enum: ['stdio'] },
          },
          required: ['enabled', 'running', 'headless', 'transport'],
        },
        UserProfilePublic: {
          type: 'object',
          description: 'Public subset of the conductor profile returned by settings.getUserProfile.',
          properties: {
            conductorName: { type: 'string' },
            conductorColor: { type: 'string' },
            conductorAvatar: { type: 'string' },
            pronouns: { type: 'string' },
          },
          required: ['conductorName', 'conductorColor', 'conductorAvatar', 'pronouns'],
        },
      },
    },
  };
}
