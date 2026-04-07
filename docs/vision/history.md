# Midway Game Development: Historical Asset Reference

This document serves as a structured index for the AI agent to facilitate data scraping, unit classification, and asset management for the "Karriers" project.

### 1. Source Context: NHHC
**Origin:** Established in 1800 by President John Adams as the Navy Department Library to preserve the U.S. Navy's official records and heritage.

### 2. Primary Historical Documentation
| Resource Type | URL | Key Data for Agent |
| :--- | :--- | :--- |
| **Comprehensive Overview** | [Midway Narrative & Photography](https://www.history.navy.mil/our-collections/photography/wars-and-events/world-war-ii/midway.html) | High-res image IDs (80-G series), chronological event tags for cut-scenes. |
| **Artistic Collection** | [Art of the Battle of Midway](https://www.history.navy.mil/our-collections/art/exhibits/conflicts-and-operations/wwii/art-of-the-battle-of-midway.html) | Eyewitness paintings by Coale and Hamilton for stylized cinematic references. |
| **IJN Order of Battle** | [Composition of Japanese Forces](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/c/composition-of-japanese-forces.html) | Ship names, command structures, and fleet positioning for the simulation engine. |
| **USN Order of Battle** | [Composition of U.S. Forces](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/c/composition-of-us-forces.html) | Task Force 16/17 breakdown, air group designations, and local Midway defenses. |

### 3. Asset Scraping & Classification Logic
To prepare these links for a scraping script, the agent should categorize assets into the following schema:

* **Type: `PHOTO`** (Source: `/photography/`)
    * *Usage:* Realistic cut-scenes, loading screens, UI background.
    * *Attribution:* "National Archives Photo [ID], courtesy of the Naval History and Heritage Command."
* **Type: `ART`** (Source: `/art/`)
    * *Usage:* Narrative storyboards, atmospheric "memory" sequences.
    * *Attribution:* "[Artist Name], NHHC Fine Art Collection."
* **Type: `DATA`** (Source: `/online-reading-room/`)
    * *Usage:* Population of TypeScript objects for ship classes and unit health/firepower stats.

### 4. Attribution Requirement
Every asset extracted from these domains must maintain a metadata link to its original URL. For the final product, use the standard format:
> *Source: Naval History and Heritage Command ([Accession Number])*