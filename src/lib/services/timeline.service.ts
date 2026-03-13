import { taskService } from './index';
import { runService } from './run.service';
import { AgentEvent, AgentMessage, RunStep } from '../../types';

export type TimelineItem =
  | { type: 'event', data: AgentEvent }
  | { type: 'message', data: AgentMessage }
  | { type: 'step', data: RunStep };

export const timelineService = {
  getTaskTimeline: async (taskId: string): Promise<TimelineItem[]> => {
    const events = await runService.getAgentEventsByTaskId(taskId);
    const messages = await taskService.getMessagesByTaskId(taskId);

    // Convert to common format and sort
    const timelineItems: TimelineItem[] = [
      ...events.map(e => ({ type: 'event' as const, data: e, timestamp: e.timestamp })),
      ...messages.map(m => ({ type: 'message' as const, data: m, timestamp: m.timestamp }))
    ].sort((a, b) => a.timestamp - b.timestamp);

    // Returning just events and messages for now to keep the timeline simple
    // but the type supports RunStep if we want to expand it in the future
    return timelineItems.map(({ type, data }) => ({ type, data })) as TimelineItem[];
  }
};
