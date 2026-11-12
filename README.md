echoes/
├── app/
│   ├── _layout.tsx               # Root Stack + background GPS task registration
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 3-Tab Bar: Explore · Current · Create
│   │   ├── explore.tsx           # Tab 1: Search by place/topic, lens filters, map & journey list
│   │   ├── current.tsx           # Tab 2: Live active journey cockpit (or empty state if idle)
│   │   └── create.tsx            # Tab 3: Your created journeys + "New Journey" launcher
│   ├── journey/
│   │   └── [id].tsx              # Journey Detail: preview stops & tap "Start" (jumps to Current tab)
│   └── studio/
│       ├── [journeyId].tsx       # Journey Builder: drop pins on map, order stops, add transit audio
│       └── stop-editor.tsx       # Modal: record mic / pick file, set trigger radius & landmark cue
├── src/
│   ├── engine/                   # PlaybackEngine.ts & LocationTask.ts
│   ├── lib/                      # geo.ts & mediaUpload.ts
│   ├── types/                    # journey.ts (derived from database.types.ts)
│   └── utils/
│       └── supabase.ts
├── database.types.ts
├── app.json
└── package.json