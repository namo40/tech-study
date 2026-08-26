import type { Messages } from './en';

const ko: Messages = {
  'site.name': 'Tech Study',
  'site.tagline': '서버 기술을 움직임으로 설명합니다',
  'site.description':
    '서버 기술 키워드를 짧은 모션 그래픽으로 설명합니다. 키워드마다 페이지 하나를 두고 영어, 한국어, 일본어를 지원합니다.',

  'nav.skipToContent': '본문으로 건너뛰기',
  'nav.home': '홈',

  'home.heading': '개념 목록',
  'home.intro':
    '키워드 하나에 페이지 하나를 씁니다. 각 페이지는 짧은 장면으로 시작해 개념을 단계별로 설명하고, .NET에서 어떻게 쓰는지 보여 줍니다.',
  'home.empty': '아직 공개된 개념이 없습니다.',
  'home.headline': '키워드 하나, {scene} 하나.',
  'home.headlineAccent': '장면',
  'home.stats': '개념 {concepts}개 · 분류 {categories}개 · English / 한국어 / 日本語',
  'home.nowPlaying': '지금 재생 중',
  'home.watchScene': '전체 장면 보기',
  'home.moreScenes': '다른 장면',
  'home.filterLabel': '이름으로 개념 찾기',
  'home.filterPlaceholder': '이름으로 찾기…',
  'home.noMatches': '조건에 맞는 개념이 없습니다.',
  'home.sceneBadge': '장면이 있는 개념',
  'home.duration': '{n}초',
  'home.allCategories': '전체',
  'home.tagLabel': '태그',

  'tag.consistency': '일관성',
  'tag.database': '데이터베이스',
  'tag.deployment': '배포와 이행',
  'tag.duplicates': '중복 처리',
  'tag.ef-core': 'EF Core',
  'tag.kubernetes': 'Kubernetes',
  'tag.latency': '지연 시간',
  'tag.memory': '메모리',
  'tag.metric': '지표',
  'tag.oauth': 'OAuth',
  'tag.overload': '과부하',
  'tag.queue': '큐',

  'lang.label': '언어',
  'lang.en': 'English',
  'lang.ko': '한국어',
  'lang.ja': '日本語',

  'theme.label': '테마',
  'theme.toLight': '라이트 테마로 전환',
  'theme.toDark': '다크 테마로 전환',

  'player.region': '장면 플레이어',
  'player.play': '재생',
  'player.pause': '일시정지',
  'player.previous': '이전 단계',
  'player.next': '다음 단계',
  'player.scrub': '재생 위치',
  'player.time': '재생 시간',
  'player.loop': '장면 반복',
  'player.sound': '효과음',
  'player.step': '{n}단계',
  'player.goToStep': '{n}단계로 이동',
  'player.keyboardHint':
    '플레이어에 초점이 있을 때 Space로 재생과 일시정지를 전환하고, 좌우 화살표 키로 단계를 옮기며, Home으로 처음으로 돌아갑니다.',
  'player.stageLabel': '개념을 설명하는 애니메이션 그림',

  'concept.partOf': '{parent}의 한 단계입니다',

  'section.whenToUse': '언제 쓰나',
  'section.cautions': '주의점',
  'section.dotnet': '.NET에서는',
  'section.related': '관련 개념',
  'section.references': '공식 자료',

  'related.noPage': '페이지 준비 중',

  'footer.aiNotice': 'Claude Fable 5를 이용하여 제작되었습니다.',
};

export default ko;
