// 页面上所有的文字和照片都在这里改，改完刷新即可
// 照片放到 photos/ 目录下；照片不存在时页面会标出期望的路径
// 页面按手机竖屏设计，照片尽量用竖图；时间线里的横图会自动改用相框展示
window.ANNIVERSARY = {
  // 两个人的名字，页面上用哥特体显示（字体只管英文字母，写中文会退回普通字体）
  me: 'PF',
  her: 'PW',

  // 相爱的日期，格式 YYYY-MM-DD，也可以带时间 YYYY-MM-DD HH:mm
  startDate: '2021-11-28',
  years: 5,

  // 封面大图，留空则用纯色封面
  cover: 'photos/cover.jpg',

  // 背景音乐：一进页面就放，整页都是它；进星空相册时停住，出来接着放。留空就是正文没有音乐，只有星空相册里有歌
  music: 'music/sogno.m4a',

  // 时间线：每个节点占一整屏，date 开头四位是年份，会显示成背景上的大数字
  // album 是这一年的星空相册：点「这一年的相册」后坐飞船倒回这一年，每一项是天上的一颗星
  //   src   照片或视频（.mp4 / .mov / .webm 会当成视频播放）
  //   title 星星旁边的小字，尽量短；text 点开后显示在下面的话
  //   poster 视频的封面图，可以不写
  // 不写 album 的节点，相册里只有 photo 这一张
  // song 是这一年的歌：飞船到站时开始放，点「返回」离开星空就停；songName 显示在星空左上角
  //   文件放到 music/ 目录下；文件不在时不出声，也不显示歌名
  timeline: [
    {
      date: '2021.11',
      title: '在一起的那天',
      text: '（写下那天发生的事：在哪里、谁先开的口、当时的心情。）',
      photo: 'photos/t1.jpg',
      song: 'music/wuyuetian.m4a',
      songName: '五月天 · S.H.E',
      album: [
        { src: 'photos/2021/01.jpg', title: '（第一张合照）', text: '（这张照片背后的事，一两句就好。）' },
        { src: 'photos/2021/02.jpg', title: '（那天的晚饭）', text: '（当时在想什么。）' },
        { src: 'photos/2021/03.jpg', title: '（偷拍的你）', text: '（为什么留着这张。）' },
        { src: 'photos/2021/04.mp4', title: '（一段小视频）', text: '（视频会在点开后直接播放。）' },
        { src: 'photos/2021/05.jpg', title: '（跨年）', text: '' }
      ]
    },
    {
      date: '2022.05',
      title: '第一次一起旅行',
      text: '（去了哪里，路上最好笑或者最狼狈的一件事。）',
      photo: 'photos/t2.jpg',
      song: 'music/aishangni.m4a',
      songName: '爱上你 · S.H.E',
      album: [
        { src: 'photos/2022/01.jpg', title: '（出发那天）', text: '（写一句。）' },
        { src: 'photos/2022/02.jpg', title: '（路上）', text: '（写一句。）' },
        { src: 'photos/2022/03.jpg', title: '（最好吃的一顿）', text: '（写一句。）' },
        { src: 'photos/2022/04.jpg', title: '（迷路了）', text: '（写一句。）' },
        { src: 'photos/2022/05.jpg', title: '（海边）', text: '（写一句。）' },
        { src: 'photos/2022/06.jpg', title: '（回程）', text: '（写一句。）' }
      ]
    },
    {
      date: '2023.08',
      title: '（第二年的一件事）',
      text: '（不一定是大事，一顿饭、一次吵架后和好都可以。）',
      photo: 'photos/t3.jpg',
      song: 'music/11.m4a',
      songName: '11 · 队长 / 黄礼格',
      album: [
        { src: 'photos/2023/01.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2023/02.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2023/03.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2023/04.jpg', title: '（照片标题）', text: '（写一句。）' }
      ]
    },
    {
      date: '2024.10',
      title: '（第三年的一件事）',
      text: '（只有你们两个人懂的梗，写在这里最合适。）',
      photo: 'photos/t4.jpg',
      song: 'music/moli.m4a',
      songName: '魔力 · S.H.E',
      album: [
        { src: 'photos/2024/01.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2024/02.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2024/03.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2024/04.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2024/05.jpg', title: '（照片标题）', text: '（写一句。）' }
      ]
    },
    {
      date: '2025.06',
      title: '（第四年的一件事）',
      text: '（她为你做过的、你一直记得的一件小事。）',
      photo: 'photos/t5.jpg',
      album: [
        { src: 'photos/2025/01.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2025/02.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2025/03.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2025/04.jpg', title: '（照片标题）', text: '（写一句。）' }
      ]
    },
    {
      date: '2026.11',
      title: '相爱五周年',
      text: '（写到今天。）',
      photo: 'photos/t6.jpg',
      album: [
        { src: 'photos/2026/01.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2026/02.jpg', title: '（照片标题）', text: '（写一句。）' },
        { src: 'photos/2026/03.jpg', title: '（今天）', text: '（写一句。）' }
      ]
    }
  ],

  // 照片堆：左右滑动翻看，caption 可以不写
  gallery: [
    { src: 'photos/01.jpg', caption: '' },
    { src: 'photos/02.jpg', caption: '' },
    { src: 'photos/03.jpg', caption: '' },
    { src: 'photos/04.jpg', caption: '' },
    { src: 'photos/05.jpg', caption: '' },
    { src: 'photos/06.jpg', caption: '' },
    { src: 'photos/07.jpg', caption: '' },
    { src: 'photos/08.jpg', caption: '' }
  ],

  // 数字：天数、月数、周末数会按 startDate 自动算出来，这里只写额外想展示的
  numbers: [
    { value: 0, unit: '座', label: '一起去过的城市' },
    { value: 0, unit: '场', label: '一起看过的电影' }
  ],

  // 一封信：每个字符串是一段
  letter: {
    greeting: '亲爱的（她的称呼）：',
    paragraphs: [
      '（这封信请用你自己的话来写，这是整个页面里最重要的部分。）',
      '（可以从“五年前的今天”写起，写一件你从没告诉过她的小事。）',
      '（最后写写接下来想和她一起做的事。）'
    ],
    sign: '（你的落款）'
  },

  // 结尾的一句话，\n 表示换行
  ending: '下一个五年，\n也请多多指教。'
};
