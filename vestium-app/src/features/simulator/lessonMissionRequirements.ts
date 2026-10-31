export interface LessonMissionRequirement {
  lessonId: string;
  missionIds: string[];
  rationale: string;
}

export const lessonMissionRequirements: Record<string, LessonMissionRequirement> = {
  's2-l2': {
    lessonId: 's2-l2',
    missionIds: ['seal-in-hold'],
    rationale: 'Demonstrate seal-in latch behavior in the simulator before lesson completion is awarded.'
  },
  's2-l3': {
    lessonId: 's2-l3',
    missionIds: ['timer-lamp-delay', 'counter-valve-done', 'one-shot-counter-diagnosis'],
    rationale:
      'Demonstrate timer/counter behavior and diagnose an edge-generation (one-shot) fault so timing and counting concepts are verified in practice.'
  },
  's3-l2': {
    lessonId: 's3-l2',
    missionIds: ['alarm-on-interlock-drop'],
    rationale: 'Prove alarm latch and acknowledge behavior, not just alarm terminology.'
  },
  's3-l3': {
    lessonId: 's3-l3',
    missionIds: ['sequence-stall-diagnosis'],
    rationale:
      'Demonstrate active-step and blocked-transition diagnosis in the sequence trainer before lesson completion.'
  },
  's5-l2': {
    lessonId: 's5-l2',
    missionIds: ['correct-hidden-fault-diagnosis'],
    rationale: 'Demonstrate evidence-based hidden fault diagnosis using rung truth and telemetry.'
  },
  // s1-l7 — "Analog Signals, Scaling, and Comms as Fault Domains" — verified present in Stage 1.
  // The analog trainer panel is rendered when stageId === 1; stageMax:1 on the mission is correct.
  's1-l7': {
    lessonId: 's1-l7',
    missionIds: ['analog-loop-fault-diagnosis'],
    rationale: 'Use loop current, raw counts, and scaled value evidence to classify analog faults in practice.'
  },
  's4-l1': {
    lessonId: 's4-l1',
    missionIds: ['vfd-handshake-diagnosis'],
    rationale: 'Diagnose a no-run drive using command/status handshake evidence instead of guessing.'
  },
  's4-l6': {
    lessonId: 's4-l6',
    missionIds: ['fieldbus-device-missing-diagnosis'],
    rationale:
      'Diagnose a fieldbus/PROFINET device-missing fault using diagnostics-first workflow before changing logic.'
  },
  's6-l1': {
    lessonId: 's6-l1',
    missionIds: ['multi-unit-shared-permit-diagnosis'],
    rationale:
      'Diagnose clustered stoppages by checking shared permits before chasing independent local faults.'
  }
};

export const getRequiredMissionIdsForLessons = (lessonIds: string[]): string[] => {
  const ids = new Set<string>();
  lessonIds.forEach((lessonId) => {
    const requirement = lessonMissionRequirements[lessonId];
    requirement?.missionIds.forEach((missionId) => ids.add(missionId));
  });
  return [...ids];
};
