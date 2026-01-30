document.addEventListener("DOMContentLoaded", () => {
  initializeCard();
});

document.addEventListener("pjax:complete", () => {
  initializeCard();
});

if (document.readyState !== "loading") {
  initializeCard();
}

function initializeCard() {
  cardTimes();
  cardRefreshTimes();
  updateBirthday();

  ensureChineseLunar();
}

function ensureChineseLunar() {
  if (typeof chineseLunar !== "undefined") return;
  if (document.querySelector("script[data-chinese-lunar]") != null) return;

  const script = document.createElement("script");
  script.src = "/schedule/chinese-lunar.js";
  script.async = true;
  script.defer = true;
  script.setAttribute("data-chinese-lunar", "true");
  script.onload = () => {
    cardTimes();
  };
  document.body.appendChild(script);
}

let year,
  month,
  week,
  date,
  dates,
  weekStr,
  monthStr,
  asideTime,
  asideDay,
  asideDayNum,
  animalYear,
  ganzhiYear,
  lunarMon,
  lunarDay;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function updateBirthday() {
  const e = document.getElementById("card-widget-schedule");
  if (!e) return;

  const now = new Date();
  const birthdayMonth = 3;
  const birthdayDay = 22;

  let next = new Date(now.getFullYear(), birthdayMonth - 1, birthdayDay, 0, 0, 0);
  if (startOfDay(next) < startOfDay(now)) {
    next = new Date(now.getFullYear() + 1, birthdayMonth - 1, birthdayDay, 0, 0, 0);
  }
  const diffDays = Math.max(0, daysBetween(now, next));

  const titleEl = e.querySelector("#schedule-title");
  if (titleEl) titleEl.innerHTML = "距离生日";
  const daysEl = e.querySelector("#schedule-days");
  if (daysEl) daysEl.innerHTML = diffDays;
  const dateEl = e.querySelector("#schedule-date");
  if (dateEl) dateEl.innerHTML = `${next.getFullYear()}-${pad2(birthdayMonth)}-${pad2(birthdayDay)}`;
}

function cardRefreshTimes() {
  const now = new Date();
  const e = document.getElementById("card-widget-schedule");
  if (e) {
    asideDay = (now - asideTime) / 1e3 / 60 / 60 / 24;
    e.querySelector("#pBar_year").value = asideDay;
    e.querySelector("#p_span_year").innerHTML =
      ((asideDay / 365) * 100).toFixed(1) + "%";
    e.querySelector(
      ".schedule-r0 .schedule-d1 .aside-span2"
    ).innerHTML = `还剩<a> ${(365 - asideDay).toFixed(0)} </a>天`;
    e.querySelector("#pBar_month").value = date;
    e.querySelector("#pBar_month").max = dates;
    e.querySelector("#p_span_month").innerHTML =
      ((date / dates) * 100).toFixed(1) + "%";
    e.querySelector(
      ".schedule-r1 .schedule-d1 .aside-span2"
    ).innerHTML = `还剩<a> ${dates - date} </a>天`;
    e.querySelector("#pBar_week").value = week === 0 ? 7 : week;
    e.querySelector("#p_span_week").innerHTML =
      (((week === 0 ? 7 : week) / 7) * 100).toFixed(1) + "%";
    e.querySelector(
      ".schedule-r2 .schedule-d1 .aside-span2"
    ).innerHTML = `还剩<a> ${7 - (week === 0 ? 7 : week)} </a>天`;

    const dayPassed =
      now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const dayRemain = Math.max(0, Math.ceil(24 - dayPassed));
    const dayValue = Math.min(24, Math.max(0, dayPassed));
    const pDay = e.querySelector("#pBar_day");
    if (pDay) {
      pDay.max = 24;
      pDay.value = dayValue;
    }
    const spanDay = e.querySelector("#p_span_day");
    if (spanDay) spanDay.innerHTML = ((dayValue / 24) * 100).toFixed(1) + "%";
    const dayText = e.querySelector(".schedule-r3 .schedule-d1 .aside-span2");
    if (dayText) dayText.innerHTML = `还剩<a> ${dayRemain} </a>小时`;
  }
}

function cardTimes() {
  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth();
  week = now.getDay();
  date = now.getDate();

  const e = document.getElementById("card-widget-calendar");
  if (e) {
    const isLeapYear =
      (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    weekStr = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][week];
    const monthData = [
      { month: "1月", days: 31 },
      { month: "2月", days: isLeapYear ? 29 : 28 },
      { month: "3月", days: 31 },
      { month: "4月", days: 30 },
      { month: "5月", days: 31 },
      { month: "6月", days: 30 },
      { month: "7月", days: 31 },
      { month: "8月", days: 31 },
      { month: "9月", days: 30 },
      { month: "10月", days: 31 },
      { month: "11月", days: 30 },
      { month: "12月", days: 31 },
    ];
    monthStr = monthData[month].month;
    dates = monthData[month].days;

    const t = (week + 8 - (date % 7)) % 7;
    let n = "",
      d = false,
      s = 7 - t;
    const o =
      (dates - s) % 7 === 0
        ? Math.floor((dates - s) / 7) + 1
        : Math.floor((dates - s) / 7) + 2;
    const c = e.querySelector("#calendar-main");
    const l = e.querySelector("#calendar-date");

    l.style.fontSize = ["64px", "48px", "36px"][Math.min(o - 3, 2)];

    for (let i = 0; i < o; i++) {
      if (!c.querySelector(`.calendar-r${i}`)) {
        c.innerHTML += `<div class='calendar-r${i}'></div>`;
      }
      for (let j = 0; j < 7; j++) {
        if (i === 0 && j === t) {
          n = 1;
          d = true;
        }
        const r = n === date ? " class='now'" : "";
        if (!c.querySelector(`.calendar-r${i} .calendar-d${j} a`)) {
          c.querySelector(
            `.calendar-r${i}`
          ).innerHTML += `<div class='calendar-d${j}'><a${r}>${n}</a></div>`;
        }
        if (n >= dates) {
          n = "";
          d = false;
        }
        if (d) {
          n += 1;
        }
      }
    }

    let lunarText = null;
    if (typeof chineseLunar !== "undefined") {
      try {
        const lunarDate = chineseLunar.solarToLunar(new Date(year, month, date));
        animalYear = chineseLunar.format(lunarDate, "A") || "";
        ganzhiYear = (chineseLunar.format(lunarDate, "T") || "").slice(0, -1);
        lunarMon = chineseLunar.format(lunarDate, "M") || "";
        lunarDay = chineseLunar.format(lunarDate, "d") || "";
        lunarText = `${ganzhiYear}${animalYear}年\u00a0${lunarMon}${lunarDay}`;
      } catch (err) {
        lunarText = null;
      }
    } else {
      ensureChineseLunar();
    }

    asideTime = new Date(`${new Date().getFullYear()}/01/01 00:00:00`);
    asideDay = (now - asideTime) / 1e3 / 60 / 60 / 24;
    asideDayNum = Math.floor(asideDay);
    const weekNum =
      week - (asideDayNum % 7) >= 0
        ? Math.ceil(asideDayNum / 7)
        : Math.ceil(asideDayNum / 7) + 1;

    e.querySelector(
      "#calendar-week"
    ).innerHTML = `第${weekNum}周&nbsp;${weekStr}`;
    e.querySelector("#calendar-date").innerHTML = date
      .toString()
      .padStart(2, "0");
    const dayOfYear = Math.floor(asideDay) + 1;
    e.querySelector(
      "#calendar-solar"
    ).innerHTML = `${year}年${monthStr}&nbsp;第${dayOfYear}天`;
    if (lunarText) {
      e.querySelector("#calendar-lunar").innerHTML = lunarText;
    }
  }
}
