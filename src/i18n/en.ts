/**
 * English is the canonical message set. `ko.ts` and `ja.ts` are typed against
 * `Messages`, so a missing or misspelled key fails the type check.
 */
const en = {
  'site.name': 'Tech Study',
  'site.tagline': 'Motion explainers for server technology',
  'site.description':
    'Short motion explainers for server technology keywords, with one page per keyword in English, Korean, and Japanese.',

  'nav.skipToContent': 'Skip to content',
  'nav.home': 'Home',

  'notFound.title': 'Page not found',
  'notFound.body': 'The page you asked for is not here.',

  'home.heading': 'Concepts',
  'home.intro':
    'One keyword, one page. Each page opens with a short animated scene, then explains the idea step by step and shows how it looks in .NET.',
  'home.empty': 'No concepts have been published yet.',
  'home.headline': 'One keyword, one {scene}.',
  'home.headlineAccent': 'scene',
  'home.stats': '{concepts} concepts · {categories} categories · English / 한국어 / 日本語',
  'home.nowPlaying': 'Now playing',
  'home.watchScene': 'Watch the full scene',
  'home.moreScenes': 'More scenes',
  'home.filterLabel': 'Filter concepts by name',
  'home.filterPlaceholder': 'Filter by name…',
  'home.noMatches': 'No concept matches that filter.',
  'home.sceneBadge': 'Has an animated scene',
  'home.duration': '{n}s',
  'home.allCategories': 'All',
  'home.tagLabel': 'Tags',

  // Cross-cutting keyword tags. The key ends in the slug written in the
  // English frontmatter, so a new tag needs one line in each message set.
  'tag.consistency': 'Consistency',
  'tag.database': 'Database',
  'tag.deployment': 'Deployment and migration',
  'tag.duplicates': 'Duplicates',
  'tag.ef-core': 'EF Core',
  'tag.kubernetes': 'Kubernetes',
  'tag.latency': 'Latency',
  'tag.memory': 'Memory',
  'tag.metric': 'Metrics',
  'tag.oauth': 'OAuth',
  'tag.overload': 'Overload',
  'tag.queue': 'Queues',

  // Difficulty, 1 to 10. The short form is what a chip shows and `level.of`
  // is how it reads out loud. The index groups the ten into five bands of
  // two, named here in the order they run.
  'level.short': 'Lv {level}',
  'level.of': 'Level {level} of 10',
  'level.bandLabel': 'Difficulty',
  'level.band.1': '1–2 Basics',
  'level.band.2': '3–4 Everyday',
  'level.band.3': '5–6 Combinations',
  'level.band.4': '7–8 Distributed',
  'level.band.5': '9–10 Internals',

  // Reading state, kept only in the reader's own browser. Each state names
  // itself in words and carries a symbol as well, so it still reads when the
  // colours are taken away.
  'reading.stateLabel': 'Reading state',
  'reading.state.unread': 'Unread',
  'reading.state.read': 'Read',
  'reading.state.updated': 'Updated',
  'reading.state.bookmarked': 'Bookmarked',
  'reading.markRead': 'Mark as read',
  'reading.markReadAgain': 'Mark as read again',
  'reading.markUnread': 'Mark as unread',
  'reading.updatedNote': 'Updated since last read',
  'reading.bookmark': 'Bookmark',
  'reading.bookmarked': 'Bookmarked',
  'reading.removeBookmark': 'Remove bookmark',
  'reading.bookmarkTitle': 'Bookmark {title}',
  'reading.progress': '{read} of {total} read · {bookmarks} bookmarked',
  'reading.sectionProgress': '{read} of {total} read',

  'lang.label': 'Language',
  'lang.en': 'English',
  'lang.ko': '한국어',
  'lang.ja': '日本語',

  'theme.label': 'Theme',
  'theme.toLight': 'Switch to the light theme',
  'theme.toDark': 'Switch to the dark theme',

  'textSize.label': 'Text size',
  'textSize.normal': 'Normal',
  'textSize.large': 'Large',
  'textSize.larger': 'Larger',
  'textSize.xlarge': 'Extra large',
  'textSize.largest': 'Largest',
  'textSize.switch': 'Text size: {current}. Switch to {next}',

  'player.region': 'Scene player',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.previous': 'Previous step',
  'player.next': 'Next step',
  'player.scrub': 'Timeline position',
  'player.time': 'Elapsed time',
  'player.loop': 'Repeat the scene',
  'player.sound': 'Sound effects',
  'player.speed': 'Playback speed',
  'player.step': 'Step {n}',
  'player.goToStep': 'Go to step {n}',
  'player.keyboardHint':
    'With the player focused: Space plays or pauses, the left and right arrow keys move between steps, and Home returns to the start.',
  'player.stageLabel': 'Animated diagram of the concept',

  'concept.partOf': 'Part of {parent}',

  'section.whenToUse': 'When to use',
  'section.cautions': 'Cautions',
  'section.dotnet': 'In .NET',
  'section.related': 'Related',
  'section.references': 'References',

  'related.noPage': 'no page yet',

  'footer.aiNotice': 'Made with Claude Fable 5.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export default en;
