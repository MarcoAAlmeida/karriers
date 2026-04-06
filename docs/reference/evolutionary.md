# Evolutionary AI Assessment for Karriers

Assessment of the Genetic Algorithm approach for the Japanese AI in the Karriers project, based on the provided engine mechanics and roadmap.

---

## 1. Genome Design: The DNA of the Imperial Japanese Navy

In an evolutionary heuristic, the genome doesn't dictate specific moves; it dictates the **biases** and **thresholds** used by the decision-making algorithms. 

Proposed TypeScript interface for the genome to be passed directly into a `JapaneseAI` class constructor:

```typescript
export interface JapaneseAIGenome {
  // --- Target Prioritization (Search & Strike) ---
  weights: {
    targetType: {
      carrier: number;        // How heavily to prioritize flat-tops
      battleship: number;
      surfaceForce: number;
      unknown: number;        // Bias toward investigating unknowns
    };
    distanceDecay: number;    // How aggressively to prioritize closer targets
    damageFocus: number;      // Tendency to focus fire on already-damaged task groups
  };

  // --- Risk Assessment & CAP ---
  thresholds: {
    launchStrikeMinP: number;        // Min detection probability to commit a strike
    capReserveRatio: number;        // Fraction of fighters to hold back for CAP
    disengageStrengthRatio: number; // Ratio at which a TG flees surface combat
  };

  // --- Scout Allocation ---
  scouting: {
    scoutLaunchInterval: number;    // How many steps between launching search waves
    sectorSpreadWidth: number;      // How wide of an arc (in sectors) to search
    minExperienceForScout: number;  // Discriminate based on pilot exp (e.g., green vs ace)
  };

  // --- Task Force Routing ---
  routing: {
    carrierStandbyDistance: number; // Ideal hex distance to maintain from detected enemies
    aggressionBias: number;         // Pull toward enemy vs. push toward map edge/objectives
    forceConcentration: number;     // Tendency to group Japanese TGs together vs. split up
  };
}
```

---

## 2. Fitness Function: Rewarding Tactics, Punishing Exploits

A proper fitness function must account for the scenario's objective while discouraging "un-historic" and gamey behavior that a genetic algorithm will inevitably try to exploit.

**Fitness Formula:**
`Fitness = w_v * V + w_k * (T_enemy / (T_friendly + 1)) - w_t * S - w_e * E`

Where:
* **`V`**: Net Victory Points at the end of the simulation (Allied points subtracted from Japanese points).
* **`T_enemy` / `T_friendly`**: Total tonnage of enemy ships sunk divided by friendly tonnage sunk (adding 1 to avoid division by zero).
* **`S`**: Total simulation steps taken. Subtracting this incentivizes the AI to win efficiently rather than running out the clock.
* **`E`**: The Exploit Penalty (crucial for keeping evolution honest).
* **`w`**: The global weights set to balance the fitness components.

### Calculating the Exploit Penalty (`E`)
To prevent the GA from discovering ridiculous tactics, `E` should accumulate points for:
1. **Suicide Scouting**: Launching aircraft with insufficient fuel to return to base.
2. **Deck-Cycling Vulnerability**: Getting caught by player strikes while carriers have a high number of aircraft spotted on deck (punishing the AI for bad deck management due to the Kido Butai multiplier).

---

## 3. Training Loop Architecture (Headless Node.js)

Since the engine has zero Vue/Nuxt imports and relies on stepping rather than wall-clock deltas, simulations can be run as fast as the CPU can execute synchronous code.

High-level training script structure in a Node.js environment:

```typescript
import { GameEngine } from '../game/engine/GameEngine';
import { JapaneseAI } from './ai/JapaneseAI';
import { generateInitialPopulation, crossover, mutate } from './ai/ga-utils';

async function runEvolution(generations = 100, populationSize = 50) {
  let population = generateInitialPopulation(populationSize);

  for (let gen = 0; gen < generations; gen++) {
    const fitnessScores = [];

    for (const genome of population) {
      // 1. Instantiate the headless engine with a fixed seed per generation for fair comparison
      const engine = new GameEngine({ seed: 42 }); 
      const ai = new JapaneseAI(genome, engine);

      // 2. Loop until the engine declares the scenario over
      let isOver = false;
      engine.events.on('ScenarioEnded', () => { isOver = true; });

      while (!isOver) {
        // AI analyzes current state and issues orders
        ai.update(); 
        // Force the engine to evaluate a full 30-minute step instantly
        engine.runStep();
      }

      // 3. Evaluate fitness after the run
      const score = calculateFitness(engine.getSnapshot(), genome);
      fitnessScores.push({ genome, score });
    }

    // 4. Selection, Crossover, and Mutation
    population = evolveNextGeneration(fitnessScores);
    
    console.log(`Generation ${gen} complete. Top score: ${fitnessScores[0].score}`);
  }
  
  // Export the top genome as a JSON file for the actual game to load
  saveTrainedWeights(population[0]);
}
```

---

## 4. Foreseen Exploits and Architectural Friction Points

Because a GA is effectively a "blind optimizer," it will aggressively probe engine rules for flaws. Based on the current mechanics, here are the biggest exploits and proposed mitigations:

* **The 90% Carrier Auto-Retreat Invincibility Shield**: Carriers have a 90% probability to auto-retreat rather than engage in surface combat. The AI will likely learn to send carriers directly into player task groups to act as indestructible scouting beacons or movement blockers, knowing they will simply bounce away unscathed if attacked.
  * *Mitigation*: Add a heavy fitness penalty for carriers entering visual range or surface combat with surface combatants.
* **The Zero-Experience Dummy Scout Spam**: Green pilots produce false reports 28% of the time. The AI might learn that sending out a flood of 1-plane search waves with green pilots is statistically superior to sending trained pilots because it blankets the grid in contacts, even if 28% are fake. 
  * *Mitigation*: Enforce a minimum squadron size for scouting or put a hard cooldown on launching search missions.
* **The 30-Minute Step Quantum Leaping**: Because movement and combat happen in discrete 30-minute chunks, high-speed units might technically "teleport" past a search arc without triggering a detection check if the physical grid distance is small enough.
  * *Mitigation*: If a task group's path intersects a search cone at any point during those 30 minutes, evaluate detection at the midpoint of the step, not just the endpoint.