/** Module-related TypeScript types */

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  required_tools: string[];
  required_models: string[];
  config_schema?: Record<string, unknown>;
}

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  tabs: string[];
}

export interface ModuleRunRequest {
  input: string;
  params?: Record<string, unknown>;
  session_id?: string;
  model?: string;
}
