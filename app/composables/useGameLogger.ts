import type { GameEngine, SidedSnapshot } from '@game/engine/GameEngine'
import type { ScenarioParams } from '@game/types/scenario'

interface StepEntry {
  stepNumber: number
  alliedSnapshotJson: string
  japaneseSnapshotJson: string
}

function serializeSnapshot(obs: SidedSnapshot): unknown {
  return {
    side: obs.side,
    time: obs.time,
    stepFraction: obs.stepFraction,
    ownTaskGroups: Object.fromEntries(obs.ownTaskGroups),
    ownShips: Object.fromEntries(obs.ownShips),
    ownSquadrons: Object.fromEntries(obs.ownSquadrons),
    ownFlightPlans: Object.fromEntries(obs.ownFlightPlans),
    enemyContacts: Object.fromEntries(obs.enemyContacts),
    combatEvents: obs.combatEvents,
    gameEvents: obs.gameEvents,
    sightingReports: obs.sightingReports,
    alliedFuelPool: isFinite(obs.alliedFuelPool) ? obs.alliedFuelPool : -1,
    japaneseFuelPool: isFinite(obs.japaneseFuelPool) ? obs.japaneseFuelPool : -1
  }
}

export function useGameLogger() {
  let stepLog: StepEntry[] = []
  let stepNumber = 0
  let scenarioId = ''
  let params: Partial<ScenarioParams> = {}

  function init(engine: GameEngine, _scenarioId: string, _params: Partial<ScenarioParams> = {}): void {
    stepLog = []
    stepNumber = 0
    scenarioId = _scenarioId
    params = _params

    engine.events.on('StepComplete', () => {
      stepLog.push({
        stepNumber: stepNumber++,
        alliedSnapshotJson: JSON.stringify(serializeSnapshot(engine.getObservation('allied'))),
        japaneseSnapshotJson: JSON.stringify(serializeSnapshot(engine.getObservation('japanese')))
      })
    })

    engine.events.on('ScenarioEnded', async (evt) => {
      try {
        await $fetch('/api/games', {
          method: 'POST',
          body: {
            scenarioId,
            paramsJson: JSON.stringify(params),
            alliedAgent: 'human',
            japaneseAgent: 'rule-based',
            winner: evt.winner,
            durationSteps: stepNumber,
            alliedPoints: evt.alliedPoints,
            japanesePoints: evt.japanesePoints,
            steps: stepLog
          }
        })
      } catch (err) {
        console.warn('[GameLogger] Failed to log game:', err)
      }
    })
  }

  return { init }
}
