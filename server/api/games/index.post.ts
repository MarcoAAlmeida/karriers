import { randomUUID } from 'uncrypto'

interface StepPayload {
  stepNumber: number
  alliedSnapshotJson: string
  japaneseSnapshotJson: string
}

interface LogGameBody {
  scenarioId: string
  paramsJson: string
  alliedAgent: string
  japaneseAgent: string
  winner: 'allied' | 'japanese' | 'draw'
  durationSteps: number
  alliedPoints: number
  japanesePoints: number
  steps: StepPayload[]
}

export default eventHandler(async (event) => {
  const body = await readBody<LogGameBody>(event)

  const gameId = randomUUID()
  const db = useDrizzle()

  await db.insert(tables.games).values({
    id: gameId,
    scenarioId: body.scenarioId,
    paramsJson: body.paramsJson,
    alliedAgent: body.alliedAgent ?? 'human',
    japaneseAgent: body.japaneseAgent ?? 'rule-based',
    winner: body.winner,
    durationSteps: body.durationSteps,
    alliedPoints: body.alliedPoints ?? 0,
    japanesePoints: body.japanesePoints ?? 0,
    createdAt: Date.now(),
  })

  if (body.steps?.length) {
    await db.insert(tables.steps).values(
      body.steps.map(s => ({
        gameId,
        stepNumber: s.stepNumber,
        alliedSnapshotJson: s.alliedSnapshotJson,
        japaneseSnapshotJson: s.japaneseSnapshotJson,
      }))
    )
  }

  return { id: gameId }
})
