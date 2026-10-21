export type Lang = 'en' | 'zh';

export const en = {
  login: {
    title: 'Log in to Folio', lead: 'Use the account you created on the Folio website.',
    email: 'Email', password: 'Password', submit: 'Log in',
    noAccount: 'No account yet?', create: 'Create one on the website', forgot: 'Forgot your password?'
  },
  nav: { profiles: 'Profiles', proxies: 'Proxies', sync: 'Window sync', tasks: 'Scheduled tasks', api: 'API & scripts', team: 'Team', activity: 'Activity log', trash: 'Trash', soon: 'Soon', soonHint: 'Arrives in an upcoming update' },
  groups: 'Groups', allProfiles: 'All profiles',
  plans: { free: 'Free', studio: 'Studio', company: 'Company' },
  periods: { monthly: 'monthly', yearly: 'yearly' },
  roles: { owner: 'Owner', admin: 'Admin', member: 'Member' },
  ws: { switch: 'Switch workspace', current: 'Current workspace' },
  plan: {
    usage: (used: number, limit: number) => `${used} of ${limit} profiles`,
    renews: (date: string, period: string) => `Renews ${date}, ${period}`,
    ends: (date: string) => `Ends ${date}`,
    trialEnds: (date: string) => `Free trial ends ${date}`,
    scheduled: (plan: string, date: string) => `Becomes ${plan} on ${date}`,
    upgrade: 'Upgrade', addProfiles: 'Add profiles', manage: 'Billing'
  },
  profiles: {
    title: 'Profiles', sub: (n: number, plan: string) => `${n} profiles · ${plan}`,
    emptyTitle: 'This workspace is ready',
    emptyBody: (limit: number) => `It can hold ${limit} profiles. Creating and opening profiles arrives in the next update.`,
    stamp: 'READY'
  },
  user: { language: 'Language', logout: 'Log out' },
  loading: 'Loading…', retry: 'Try again',
  errors: {
    invalid_credentials: 'The email or password is not right.',
    unauthenticated: 'Your session has ended. Log in again.',
    rate_limited: 'Too many attempts. Wait a minute and try again.',
    validation: 'Enter your email and password.',
    network: 'Can’t reach Folio. Check your connection and try again.',
    internal: 'Something went wrong on our side. Try again.'
  } as Record<string, string>
};

export type Dict = typeof en;

export const zh: Dict = {
  login: {
    title: '登录 Folio', lead: '使用你在 Folio 官网注册的账号。',
    email: '邮箱', password: '密码', submit: '登录',
    noAccount: '还没有账号？', create: '去官网注册', forgot: '忘记密码？'
  },
  nav: { profiles: '环境', proxies: '代理', sync: '窗口同步', tasks: '定时任务', api: 'API 与脚本', team: '团队', activity: '操作日志', trash: '回收站', soon: '即将推出', soonHint: '会在后续版本中推出' },
  groups: '分组', allProfiles: '全部环境',
  plans: { free: '体验版', studio: '工作室版', company: '公司版' },
  periods: { monthly: '月付', yearly: '年付' },
  roles: { owner: '所有者', admin: '管理员', member: '成员' },
  ws: { switch: '切换团队', current: '当前团队' },
  plan: {
    usage: (used: number, limit: number) => `已用 ${used} / ${limit} 个环境`,
    renews: (date: string, period: string) => `${date} 续费 · ${period}`,
    ends: (date: string) => `${date} 到期`,
    trialEnds: (date: string) => `免费试用 ${date} 结束`,
    scheduled: (plan: string, date: string) => `${date} 起改为${plan}`,
    upgrade: '升级', addProfiles: '增加环境', manage: '账单'
  },
  profiles: {
    title: '环境', sub: (n: number, plan: string) => `${n} 个环境 · ${plan}`,
    emptyTitle: '这个团队已经准备好了',
    emptyBody: (limit: number) => `最多可以放 ${limit} 个环境。新建和打开环境会在下一个版本推出。`,
    stamp: 'READY'
  },
  user: { language: '语言', logout: '退出登录' },
  loading: '加载中…', retry: '重试',
  errors: {
    invalid_credentials: '邮箱或密码不对。',
    unauthenticated: '登录已过期，请重新登录。',
    rate_limited: '操作太频繁，请等一分钟再试。',
    validation: '请填写邮箱和密码。',
    network: '连不上 Folio，请检查网络后重试。',
    internal: '我们这边出了点问题，请重试。'
  }
};

export const dicts: Record<Lang, Dict> = { en, zh };

const locale = (lang: Lang) => (lang === 'zh' ? 'zh-CN' : 'en-US');
export const day = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: lang === 'zh' ? 'long' : 'short', day: 'numeric' }).format(new Date(iso));
