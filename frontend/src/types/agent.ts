/** 智能体相关 TypeScript 类型 */

export interface AgentConfig {
  name: string;
  persona: string;
  model?: string;
  temperature: number;
  tools: string[];
}

export interface AgentState {
  name: string;
  status: 'idle' | 'thinking' | 'acting' | 'done';
  messages_sent: number;
  tokens_used: number;
  cost_usd: number;
  last_action?: string;
}

export interface Message {
  id: string;
  sender: string;
  content: string;
  msg_type: 'idea' | 'critique' | 'synthesis' | 'vote';
  references: string[];
  timestamp: string;
}
