// ═══════════════════════════════════════════════
// 消费分类体系 — 15 大类 + 多标签系统
// ═══════════════════════════════════════════════

// All available tags (消费性质标签)
export const ALL_TAGS = [
  { key: 'rigid',       label: '刚需',   color: '#0f6e56', bg: '#e1f5ee' },
  { key: 'fixed',       label: '固定',   color: '#185fa5', bg: '#e6f1fb' },
  { key: 'elastic',     label: '弹性',   color: '#854f0b', bg: '#faeeda' },
  { key: 'emotion',     label: '情绪',   color: '#993556', bg: '#fbeaf0' },
  { key: 'social',      label: '社交',   color: '#ba7517', bg: '#faeeda' },
  { key: 'efficiency',  label: '效率',   color: '#378add', bg: '#e6f1fb' },
  { key: 'improve',     label: '改善',   color: '#1d9e75', bg: '#e1f5ee' },
  { key: 'career_img',  label: '职场形象', color: '#534ab7', bg: '#eeedfe' },
  { key: 'career_need', label: '职业必要', color: '#534ab7', bg: '#eeedfe' },
  { key: 'reimbursable',label: '可报销',  color: '#378add', bg: '#e6f1fb' },
  { key: 'growth',      label: '提升',   color: '#3b6d11', bg: '#eaf3de' },
  { key: 'long_invest', label: '长期投资', color: '#3b6d11', bg: '#eaf3de' },
  { key: 'health',      label: '健康',   color: '#7f77dd', bg: '#eeedfe' },
  { key: 'risk',        label: '风险保障', color: '#7f77dd', bg: '#eeedfe' },
  { key: 'reward',      label: '奖励',   color: '#ef9f27', bg: '#faeeda' },
  { key: 'relationship',label: '关系维护', color: '#ba7517', bg: '#faeeda' },
  { key: 'non_expense', label: '非消费',  color: '#8e8e93', bg: '#f1efe8' },
  { key: 'accounting',  label: '账务处理', color: '#8e8e93', bg: '#f1efe8' },
  { key: 'abnormal',    label: '异常',   color: '#c0392b', bg: '#ffebeb' },
  { key: 'pending',     label: '待分类',  color: '#8e8e93', bg: '#f1efe8' },
  { key: 'entertainment',label:'娱乐',   color: '#d4537e', bg: '#fbeaf0' },
  { key: 'high_freq',   label: '高频',   color: '#ef9f27', bg: '#faeeda' },
]

export const TAG_MAP = {}
for (const t of ALL_TAGS) TAG_MAP[t.key] = t

// SVG icon paths (simple line art style)
export const ICONS = {
  housing:    'M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z M9 21V14h6v7',
  food:       'M18 8h1a4 4 0 010 8h-1 M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3 M10 1v3 M14 1v3',
  transport:  'M5 17a2 2 0 104 0 M15 17a2 2 0 104 0 M3 17h2 M9 17h6 M19 17h2 M3 11l2-6h14l2 6',
  daily:      'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  fashion:    'M12 2C8 2 4 6 4 10v2h16v-2c0-4-4-8-8-8z M4 12v6c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4v-6',
  digital:    'M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z M9 22h6 M12 18v4',
  career:     'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
  education:  'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  health:     'M22 12h-4l-3 9L9 3l-3 9H2',
  sport:      'M12 12m-10 0a10 10 0 1020 0a10 10 0 10-20 0 M12 2a14.5 14.5 0 000 20 M12 2a14.5 14.5 0 010 20 M2 12h20',
  entertain:  'M6 2l.7 2H19a1 1 0 01.9 1.5l-2.8 10a1 1 0 01-.9.5H8.1a1 1 0 01-.9-.5L4 2 M8 20a1 1 0 102 0 1 1 0 00-2 0 M17 20a1 1 0 102 0 1 1 0 00-2 0',
  travel:     'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-2 2 4-1 4-1 2 4 2-2v-3l3-2 3.4 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.5-.7.3-1.1z',
  social:     'M20.8 14.4c.5-.8.8-1.8.8-2.9 0-3.1-2.5-5.5-5.5-5.5S10.5 8.4 10.5 11.5c0 3.1 2.5 5.5 5.5 5.5.7 0 1.4-.1 2-.4L21 18l-.2-3.6z M15.5 6c-.2-2.8-2.6-5-5.5-5C6.9 1 4.5 3.4 4.5 6.5c0 1.1.3 2.1.8 2.9L5 13l2.9-1.4',
  transfer:   'M17 1l4 4-4 4 M3 11V9a4 4 0 014-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 01-4 4H3',
  other:      'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
}

export const CATEGORIES = [
  {
    key: 'housing', label: '居住生活', icon: 'housing',
    color: '#185fa5', bg: '#e6f1fb',
    defaultTags: ['rigid', 'fixed', 'improve'],
    subs: [
      { key: 'rent',       label: '房租',   keywords: ['房租','租金','合租','押金','自如','贝壳','链家'] },
      { key: 'deposit',    label: '押金',   keywords: ['押金','保证金'] },
      { key: 'utility',    label: '水电燃气', keywords: ['水费','电费','燃气','暖气'] },
      { key: 'broadband',  label: '宽带',   keywords: ['宽带','网费'] },
      { key: 'property',   label: '物业',   keywords: ['物业费','物业'] },
      { key: 'repair',     label: '维修',   keywords: ['维修','修缮','疏通','开锁','换锁'] },
      { key: 'moving',     label: '搬家',   keywords: ['搬家','货拉拉'] },
      { key: 'home_org',   label: '家居收纳', keywords: ['收纳','家居','家具','装饰'] },
    ]
  },
  {
    key: 'food', label: '餐饮消费', icon: 'food',
    color: '#ef9f27', bg: '#faeeda',
    defaultTags: ['rigid', 'elastic', 'emotion', 'social'],
    subs: [
      { key: 'work_meal',  label: '工作餐',  keywords: ['食堂','工作餐','午餐','便当'] },
      { key: 'breakfast',  label: '早餐',   keywords: ['早餐','包子','豆浆','煎饼'] },
      { key: 'takeout',    label: '外卖',   keywords: ['美团','饿了么','外卖'] },
      { key: 'coffee',     label: '咖啡奶茶', keywords: ['瑞幸','星巴克','喜茶','奈雪','蜜雪','茶百道','COCO','咖啡','奶茶','Manner','Tims','一点点'] },
      { key: 'gathering',  label: '聚餐',   keywords: ['聚餐','宴请','火锅','烤肉','酒席'] },
      { key: 'late_snack', label: '夜宵',   keywords: ['夜宵','烧烤','大排档'] },
    ]
  },
  {
    key: 'transport', label: '交通出行', icon: 'transport',
    color: '#378add', bg: '#e6f1fb',
    defaultTags: ['rigid', 'efficiency', 'elastic'],
    subs: [
      { key: 'metro_bus',  label: '地铁公交', keywords: ['地铁','公交','苏州支付宝小程序自动充值'] },
      { key: 'taxi',       label: '打车',   keywords: ['滴滴','打车','网约车','高德打车','曹操','T3','首汽'] },
      { key: 'bike',       label: '共享单车', keywords: ['共享单车','哈啰','青桔','摩拜'] },
      { key: 'long_trip',  label: '高铁机票', keywords: ['高铁','火车','机票','飞机','大巴','12306','携程','去哪儿','同程','航空'] },
      { key: 'driving',    label: '自驾停车', keywords: ['加油','充电桩','ETC','停车','违章','罚款','保养','洗车','车险'] },
    ]
  },
  {
    key: 'daily', label: '日用消耗', icon: 'daily',
    color: '#1d9e75', bg: '#e1f5ee',
    defaultTags: ['rigid', 'high_freq', 'elastic'],
    subs: [
      { key: 'cleaning',   label: '清洁用品', keywords: ['清洁','洗衣液','洗洁精','垃圾袋','拖把'] },
      { key: 'personal',   label: '洗护个护', keywords: ['洗护','沐浴','牙膏','洗面奶','洗发水','卫生巾'] },
      { key: 'paper',      label: '纸品',   keywords: ['纸巾','抽纸','卷纸','湿巾'] },
      { key: 'misc_daily', label: '生活小物', keywords: ['日用','小物','便利店','711','全家','罗森','超市','物美','华润','永辉','大润发','沃尔玛','盒马','叮咚','朴朴'] },
      { key: 'pet',        label: '宠物用品', keywords: ['宠物','猫粮','狗粮','猫砂','宠物医院'] },
    ]
  },
  {
    key: 'fashion', label: '形象管理', icon: 'fashion',
    color: '#d4537e', bg: '#fbeaf0',
    defaultTags: ['career_img', 'elastic', 'emotion'],
    subs: [
      { key: 'clothes',    label: '服装',   keywords: ['服装','衣服','裙','裤','ZARA','优衣库','H&M','旗袍'] },
      { key: 'shoes_bags', label: '鞋包',   keywords: ['鞋','包','Nike','Adidas','运动鞋'] },
      { key: 'cosmetics',  label: '美妆护肤', keywords: ['化妆','护肤','美妆','口红','面膜','精华'] },
      { key: 'haircut',    label: '理发',   keywords: ['理发','美发','Tony','剪发'] },
      { key: 'nails',      label: '美甲',   keywords: ['美甲','美睫'] },
      { key: 'accessories',label: '配饰',   keywords: ['饰品','首饰','手表','眼镜','配饰'] },
    ]
  },
  {
    key: 'digital', label: '数码订阅', icon: 'digital',
    color: '#534ab7', bg: '#eeedfe',
    defaultTags: ['fixed', 'efficiency', 'entertainment'],
    subs: [
      { key: 'phone_bill', label: '话费',   keywords: ['话费','充值','中国移动','中国联通','中国电信','移动','联通','电信','流量','安徽移动'] },
      { key: 'app_sub',    label: 'App会员', keywords: ['会员','订阅','Apple','App Store'] },
      { key: 'media_sub',  label: '影音会员', keywords: ['爱奇艺','优酷','腾讯视频','B站','bilibili','网易云','酷狗','QQ音乐','Spotify','Netflix'] },
      { key: 'ai_tools',   label: 'AI工具',  keywords: ['ChatGPT','GPT','Claude','AI','Notion','Figma'] },
      { key: 'cloud',      label: '云服务',  keywords: ['云盘','iCloud','百度网盘','阿里云'] },
      { key: 'gadgets',    label: '数码配件', keywords: ['耳机','充电','数据线','键盘','鼠标','手机壳','贴膜'] },
    ]
  },
  {
    key: 'career', label: '职场支出', icon: 'career',
    color: '#2c5282', bg: '#e6f1fb',
    defaultTags: ['career_need', 'reimbursable', 'efficiency'],
    subs: [
      { key: 'office',     label: '办公用品', keywords: ['办公','文具'] },
      { key: 'print_cert', label: '证件打印', keywords: ['打印','复印','证件','照片'] },
      { key: 'work_gear',  label: '职业装备', keywords: ['职业','装备','工装'] },
      { key: 'biz_trip',   label: '出差垫付', keywords: ['出差','垫付','差旅'] },
      { key: 'biz_social', label: '工作应酬', keywords: ['应酬','商务'] },
    ]
  },
  {
    key: 'education', label: '学习成长', icon: 'education',
    color: '#3b6d11', bg: '#eaf3de',
    defaultTags: ['growth', 'long_invest'],
    subs: [
      { key: 'course',     label: '课程',   keywords: ['课程','培训','极客时间','得到','Coursera','Udemy','慕课','网易公开课'] },
      { key: 'books',      label: '书籍',   keywords: ['书籍','图书','书店','当当','阅读'] },
      { key: 'exam',       label: '考证',   keywords: ['考试','报名','考证','驾照'] },
      { key: 'language',   label: '语言考试', keywords: ['雅思','托福','日语','英语','四六级'] },
      { key: 'knowledge',  label: '知识付费', keywords: ['知乎','付费','专栏'] },
      { key: 'tools',      label: '工具软件', keywords: ['软件','工具','学习'] },
    ]
  },
  {
    key: 'health', label: '健康医疗', icon: 'health',
    color: '#7f77dd', bg: '#eeedfe',
    defaultTags: ['rigid', 'risk'],
    subs: [
      { key: 'clinic',     label: '挂号',   keywords: ['挂号','门诊','医院'] },
      { key: 'medicine',   label: '药品',   keywords: ['药','药店','药房','同仁堂','大药房'] },
      { key: 'checkup',    label: '体检',   keywords: ['体检','检查','化验'] },
      { key: 'dental_eye', label: '牙科眼科', keywords: ['洗牙','补牙','种牙','配镜','眼科','口腔','正畸','隐形眼镜'] },
      { key: 'mental',     label: '心理咨询', keywords: ['心理','咨询','情绪'] },
      { key: 'insurance',  label: '保险',   keywords: ['保险','医疗险','意外险','社保'] },
    ]
  },
  {
    key: 'sport', label: '运动健身', icon: 'sport',
    color: '#0f6e56', bg: '#e1f5ee',
    defaultTags: ['health', 'growth', 'elastic'],
    subs: [
      { key: 'gym',        label: '健身卡',  keywords: ['健身房','健身','月卡','年卡','半年卡'] },
      { key: 'trainer',    label: '私教',   keywords: ['私教','教练'] },
      { key: 'sport_gear', label: '运动装备', keywords: ['运动装备','瑜伽垫','跑步机','健身器材'] },
      { key: 'yoga',       label: '瑜伽',   keywords: ['瑜伽'] },
      { key: 'outdoor',    label: '户外活动', keywords: ['露营','骑行','登山','徒步','帐篷','户外'] },
    ]
  },
  {
    key: 'entertain', label: '休闲娱乐', icon: 'entertain',
    color: '#d4537e', bg: '#fbeaf0',
    defaultTags: ['elastic', 'emotion'],
    subs: [
      { key: 'movie',      label: '电影',   keywords: ['电影','影院','万达'] },
      { key: 'show',       label: '演出',   keywords: ['演唱会','话剧','音乐节','演出','展览','博物馆'] },
      { key: 'game',       label: '游戏',   keywords: ['游戏','Steam','充值'] },
      { key: 'hobby',      label: '兴趣爱好', keywords: ['手办','乐器','画材','潮玩','盲盒'] },
      { key: 'online_fun', label: '线上娱乐', keywords: ['直播','打赏'] },
    ]
  },
  {
    key: 'travel', label: '旅游度假', icon: 'travel',
    color: '#0f6e56', bg: '#e1f5ee',
    defaultTags: ['reward', 'elastic'],
    subs: [
      { key: 'travel_transport', label: '交通', keywords: ['包车','租车','景区巴士'] },
      { key: 'travel_hotel',     label: '住宿', keywords: ['酒店','民宿','Airbnb','如家','汉庭','全季','亚朵','途家'] },
      { key: 'travel_sight',     label: '景点', keywords: ['门票','景区','导游','纪念品'] },
      { key: 'travel_shopping',  label: '旅行购物', keywords: ['特产','免税'] },
      { key: 'visa',             label: '签证', keywords: ['签证','电子签'] },
      { key: 'travel_food',      label: '旅行餐饮', keywords: [] },
    ]
  },
  {
    key: 'social', label: '人情社交', icon: 'social',
    color: '#ba7517', bg: '#faeeda',
    defaultTags: ['social', 'relationship'],
    subs: [
      { key: 'red_packet', label: '红包',   keywords: ['红包'] },
      { key: 'ceremony',   label: '礼金',   keywords: ['礼金','随礼','份子钱','婚礼','寿宴','满月'] },
      { key: 'treat',      label: '请客',   keywords: ['请客','请吃'] },
      { key: 'souvenir',   label: '伴手礼',  keywords: ['伴手礼','礼品','礼盒'] },
      { key: 'gift',       label: '节日礼物', keywords: ['礼物','生日','节日'] },
    ]
  },
  {
    key: 'transfer', label: '资金流转', icon: 'transfer',
    color: '#8e8e93', bg: '#f1efe8',
    defaultTags: ['non_expense', 'accounting'],
    subs: [
      { key: 'credit_card',label: '信用卡还款', keywords: ['信用卡','还款','花呗主动还款'] },
      { key: 'loan',       label: '借还款',  keywords: ['借款','还钱','借钱','拆借'] },
      { key: 'aa',         label: 'AA',     keywords: ['AA','均摊'] },
      { key: 'reimburse',  label: '报销',   keywords: ['报销'] },
      { key: 'deposit_ref',label: '押金退还', keywords: ['退还','退款','退押金'] },
    ]
  },
  {
    key: 'other', label: '其他异常', icon: 'other',
    color: '#8e8e93', bg: '#f1efe8',
    defaultTags: ['abnormal', 'pending'],
    subs: [
      { key: 'fine',       label: '罚款',   keywords: ['罚款','罚单'] },
      { key: 'cert_reissue',label:'证件补办', keywords: ['补办','证件'] },
      { key: 'lost',       label: '遗失',   keywords: ['遗失','丢失'] },
      { key: 'unknown',    label: '无法识别', keywords: [] },
    ]
  },
]

// Quick lookup maps
export const CAT_MAP = {}
export const SUB_MAP = {}
for (const cat of CATEGORIES) {
  CAT_MAP[cat.key] = cat
  for (const sub of cat.subs) {
    SUB_MAP[sub.key] = { ...sub, parentKey: cat.key }
  }
}

export function getCategoryByKey(key) {
  return CAT_MAP[key] || CAT_MAP['other']
}

// Dimension labels (for backward compat)
export const DIMENSION_LABELS = {
  rigid: '刚需固定', elastic: '弹性消费', growth: '提升投资',
  social: '人情流转', emotion: '情绪消费', efficiency: '效率支出',
  fixed: '固定支出', health: '健康', reward: '奖励消费',
  non_expense: '非消费', career_need: '职业必要',
}
