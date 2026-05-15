import { beforeEach, describe, expect, it } from 'vitest';
import { clearSkillsCache, getBuiltinSkill } from '../features/builtin-skills/skills.js';

describe('task-graph execution pipeline skill', () => {
  beforeEach(() => {
    clearSkillsCache();
  });

  it('loads the task-graph skill with ralph worker + merge verification guidance', () => {
    const skill = getBuiltinSkill('task-graph');
    expect(skill).toBeDefined();
    expect(skill?.template).toContain('isolated short-lived ralph workers');
    expect(skill?.template).toContain('merge + verification');
  });

  it('wires deep-interview and ralplan templates to the task-graph execution path', () => {
    const deepInterview = getBuiltinSkill('deep-interview');
    const ralplan = getBuiltinSkill('ralplan');

    expect(deepInterview?.template).toContain('Skill("oh-my-claudecode:task-graph")');
    expect(ralplan?.template).toContain('Skill("oh-my-claudecode:task-graph")');
  });
});
