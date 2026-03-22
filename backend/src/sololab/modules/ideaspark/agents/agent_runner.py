"""智能体执行引擎 —— 单个角色智能体的 LLM 调用 + 工具调用。"""

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentConfig, AgentState, Message, MessageType
from sololab.modules.ideaspark.prompts.system_prompts import get_prompt


class AgentRunner:
    """执行单个角色智能体的完整生命周期。

    1. 构建 system prompt + context messages
    2. 调用 LLM generate
    3. 解析工具调用指令并执行
    4. 解析输出为 Message 对象
    """

    def __init__(
        self,
        config: AgentConfig,
        llm_gateway: LLMGateway,
        tool_registry: Optional[ToolRegistry] = None,
    ) -> None:
        self.config = config
        self.llm = llm_gateway
        self.tools = tool_registry
        self.state = AgentState(name=config.name)

    async def run(
        self,
        topic: str,
        context_messages: List[Message] = None,
        task_prompt: str = "",
    ) -> List[Message]:
        """执行智能体，返回生成的消息列表。"""
        self.state.status = "thinking"

        system_prompt = get_prompt(self.config.name)
        messages = self._build_messages(topic, context_messages or [], task_prompt)

        # 调用 LLM
        result = await self.llm.generate(
            messages=[{"role": "system", "content": system_prompt}] + messages,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
        )

        content = result["content"]
        self.state.tokens_used += result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
        self.state.cost_usd += result["usage"]["cost_usd"]

        # 检查是否有工具调用请求
        tool_results = await self._handle_tool_calls(content)
        if tool_results:
            # 将工具结果注入上下文，再次调用 LLM
            messages.append({"role": "assistant", "content": content})
            messages.append({
                "role": "user",
                "content": f"Tool results:\n{json.dumps(tool_results, ensure_ascii=False, indent=2)}\n\nBased on these results, provide your final response.",
            })
            result = await self.llm.generate(
                messages=[{"role": "system", "content": system_prompt}] + messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
            )
            content = result["content"]
            self.state.tokens_used += result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
            self.state.cost_usd += result["usage"]["cost_usd"]

        # 解析输出为 Message
        parsed = self._parse_output(content)
        self.state.status = "done"
        self.state.messages_sent += len(parsed)
        self.state.last_action = f"generated {len(parsed)} message(s)"
        return parsed

    def _build_messages(
        self, topic: str, context: List[Message], task_prompt: str
    ) -> List[Dict[str, str]]:
        """构建发送给 LLM 的消息列表。"""
        msgs: List[Dict[str, str]] = []

        # 上下文消息（黑板上其他智能体的输出）
        if context:
            context_text = "\n\n".join(
                f"[{m.sender}] ({m.msg_type.value}): {m.content}" for m in context
            )
            msgs.append({
                "role": "user",
                "content": f"Previous discussion:\n{context_text}",
            })

        # 当前任务
        prompt = task_prompt or f"Research topic: {topic}\n\nProvide your ideas and analysis."
        if self.config.tools:
            tool_names = ", ".join(self.config.tools)
            prompt += f"\n\nYou have access to these tools: {tool_names}. To use a tool, write: [tool: tool_name(query=\"your query\")]"

        msgs.append({"role": "user", "content": prompt})
        return msgs

    async def _handle_tool_calls(self, content: str) -> List[Dict[str, Any]]:
        """检测并执行 LLM 输出中的工具调用。"""
        if not self.tools or not self.config.tools:
            return []

        # 匹配 [tool: tool_name(query="...")] 格式
        pattern = r'\[tool:\s*(\w+)\(query="([^"]+)"\)\]'
        matches = re.findall(pattern, content)
        results = []

        for tool_name, query in matches:
            if tool_name not in self.config.tools:
                continue
            tool = self.tools.get_tool(tool_name)
            if not tool:
                continue
            self.state.status = "executing"
            self.state.last_action = f"calling {tool_name}"
            tool_result = await tool.execute({"query": query, "max_results": 3})
            results.append({
                "tool": tool_name,
                "query": query,
                "success": tool_result.success,
                "data": tool_result.data,
            })

        return results

    def _parse_output(self, content: str) -> List[Message]:
        """解析 LLM 输出为 Message 对象列表。"""
        # 尝试从输出中提取 msg_type 标记
        msg_type = self._detect_msg_type(content)

        # 清理认知规划部分（前 3 行反思），保留实质内容
        lines = content.strip().split("\n")
        clean_lines = []
        skip_planning = True
        for line in lines:
            stripped = line.strip()
            if skip_planning and (
                stripped.startswith("1.") or stripped.startswith("2.") or stripped.startswith("3.")
            ):
                continue
            skip_planning = False
            # 跳过 [msg_type: xxx] 标记行
            if re.match(r'^\[msg_type:\s*\w+\]', stripped):
                continue
            clean_lines.append(line)

        clean_content = "\n".join(clean_lines).strip()
        if not clean_content:
            clean_content = content.strip()

        return [
            Message(
                id=str(uuid.uuid4()),
                sender=self.config.name,
                content=clean_content,
                msg_type=msg_type,
            )
        ]

    def _detect_msg_type(self, content: str) -> MessageType:
        """从输出内容检测消息类型。"""
        content_lower = content.lower()
        if "[msg_type: vote]" in content_lower or "winner:" in content_lower:
            return MessageType.VOTE
        if "[msg_type: critique]" in content_lower:
            return MessageType.CRITIQUE
        if "[msg_type: synthesis]" in content_lower:
            return MessageType.SYNTHESIS
        return MessageType.IDEA
