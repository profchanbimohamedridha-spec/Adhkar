(function(){
  "use strict";

  const STORAGE_KEY = "adhkar_tracker_v1";
  const DIAL_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

  /* ---------------- تخزين البيانات ---------------- */
  function loadStore(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { days: {} };
      const parsed = JSON.parse(raw);
      if(!parsed.days) parsed.days = {};
      return parsed;
    }catch(e){
      console.error("تعذّرت قراءة البيانات المحفوظة", e);
      return { days: {} };
    }
  }
  function saveStore(store){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }catch(e){
      console.error("تعذّر حفظ البيانات", e);
      alert("تعذّر حفظ التقدّم. قد تكون مساحة التخزين ممتلئة.");
    }
  }

  let store = loadStore();

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function dateKeyOffset(offsetDays){
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function ensureDay(key){
    if(!store.days[key]) store.days[key] = { morning: {}, evening: {}, sleep: {} };
    if(!store.days[key].morning) store.days[key].morning = {};
    if(!store.days[key].evening) store.days[key].evening = {};
    if(!store.days[key].sleep) store.days[key].sleep = {};
    return store.days[key];
  }

  function requiredCount(item){
    // بعض الأذكار لها صيغة نصية للعدد (مثل "1، أو 2، أو 3، أو 4") فنعتمد أول رقم فيها كهدف
    if(typeof item.count === "number") return item.count;
    const match = String(item.count).match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  /* ---------------- الرسم (Render) ---------------- */
  function renderList(session){
    const listEl = document.getElementById(`list-${session}`);
    listEl.innerHTML = "";
    const dayData = ensureDay(todayKey())[session];
    const items = AZKAR[session];

    items.forEach((item, idx) => {
      const req = requiredCount(item);
      const done = dayData[item.id] || 0;
      const isDone = done >= req;

      const li = document.createElement("li");
      li.className = "azkar-card" + (isDone ? " done" : "");
      li.dataset.id = item.id;

      li.innerHTML = `
        <div class="azkar-top">
          <span class="azkar-number">${idx+1}</span>
          <p class="azkar-text">${item.text}</p>
        </div>
        ${item.note ? `<p class="azkar-note">${item.note}</p>` : ""}
        <div class="azkar-bottom">
          <div class="counter">
            <button class="counter-btn" data-action="minus" aria-label="إنقاص">−</button>
            <span class="counter-progress"><span class="c-done">${done}</span> / <span class="c-req">${req}</span></span>
            <button class="counter-btn" data-action="plus" aria-label="زيادة">+</button>
          </div>
          <span class="check-badge">${isDone ? "✓ أُنجز" : "⋯ لم يُنجز"}</span>
        </div>
      `;

      const minusBtn = li.querySelector('[data-action="minus"]');
      const plusBtn = li.querySelector('[data-action="plus"]');
      minusBtn.addEventListener("click", () => updateCount(session, item, -1));
      plusBtn.addEventListener("click", () => updateCount(session, item, 1));

      listEl.appendChild(li);
    });

    updateDial(session);
  }

  function updateCount(session, item, delta){
    const day = ensureDay(todayKey());
    const req = requiredCount(item);
    const current = day[session][item.id] || 0;
    let next = current + delta;
    if(next < 0) next = 0;
    if(next > req) next = req;
    day[session][item.id] = next;
    saveStore(store);
    renderList(session);
  }

  function updateDial(session){
    const items = AZKAR[session];
    const day = ensureDay(todayKey())[session];
    let totalReq = 0, totalDone = 0;
    items.forEach(item => {
      const req = requiredCount(item);
      const done = Math.min(day[item.id] || 0, req);
      totalReq += req;
      totalDone += done;
    });
    const pct = totalReq === 0 ? 0 : Math.round((totalDone/totalReq) * 100);
    const dialFill = document.querySelector(`#dial-${session} .dial-fill`);
    const offset = DIAL_CIRCUMFERENCE - (pct/100) * DIAL_CIRCUMFERENCE;
    dialFill.style.strokeDasharray = DIAL_CIRCUMFERENCE;
    dialFill.style.strokeDashoffset = offset;
    document.getElementById(`pct-${session}`).textContent = pct + "%";
  }

  function resetSession(session){
    if(!confirm("هل تريد إعادة تعيين عدّاد اليوم لهذا القسم؟")) return;
    const day = ensureDay(todayKey());
    day[session] = {};
    saveStore(store);
    renderList(session);
  }

  function completeAll(session){
    const day = ensureDay(todayKey());
    AZKAR[session].forEach(item => {
      day[session][item.id] = requiredCount(item);
    });
    saveStore(store);
    renderList(session);
  }

  /* ---------------- التبويبات ---------------- */
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll("[data-view]");
  const skyEl = document.getElementById("sky");

  function activateTab(name){
    tabs.forEach(t => t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false"));
    views.forEach(v => v.hidden = (v.id !== `view-${name}`));

    if(name === "evening" || name === "sleep"){
      skyEl.classList.add("mode-evening");
      document.body.classList.add("evening-mode");
    } else if(name === "morning"){
      skyEl.classList.remove("mode-evening");
      document.body.classList.remove("evening-mode");
    }
    if(name === "stats") renderStats();
  }

  tabs.forEach(t => t.addEventListener("click", () => activateTab(t.dataset.tab)));

  document.querySelectorAll("[data-reset]").forEach(btn=>{
    btn.addEventListener("click", () => resetSession(btn.dataset.reset));
  });
  document.querySelectorAll("[data-complete-all]").forEach(btn=>{
    btn.addEventListener("click", () => completeAll(btn.dataset.completeAll));
  });

  /* ---------------- الإحصائيات ---------------- */
  function dayCompletion(key){
    const dayData = store.days[key];
    if(!dayData) return { morning:0, evening:0, sleep:0 };
    function pctFor(session){
      const items = AZKAR[session];
      let req=0, done=0;
      items.forEach(item=>{
        const r = requiredCount(item);
        req += r;
        done += Math.min((dayData[session] && dayData[session][item.id]) || 0, r);
      });
      return req === 0 ? 0 : done/req;
    }
    return { morning: pctFor("morning"), evening: pctFor("evening"), sleep: pctFor("sleep") };
  }

  function isDayFull(key){
    const c = dayCompletion(key);
    return c.morning >= 1 && c.evening >= 1 && c.sleep >= 1;
  }
  function isDayPartial(key){
    const c = dayCompletion(key);
    return (c.morning > 0 || c.evening > 0 || c.sleep > 0);
  }

  function computeStreak(){
    let streak = 0;
    let offset = 0;
    // إذا لم يُنجز اليوم بعد، نبدأ الحساب من الأمس حتى لا يُصفَّر العدّاد أثناء اليوم الجاري
    if(!isDayFull(todayKey())) offset = 1;
    while(true){
      const key = dateKeyOffset(offset);
      if(isDayFull(key)){
        streak++;
        offset++;
      } else break;
    }
    return streak;
  }

  function computeBestStreak(){
    const keys = Object.keys(store.days).sort();
    if(keys.length === 0) return 0;
    let best = 0, current = 0;
    let prevDate = null;
    keys.forEach(key=>{
      if(!isDayFull(key)){ current = 0; prevDate = null; return; }
      const d = new Date(key);
      if(prevDate){
        const diff = (d - prevDate) / 86400000;
        current = diff === 1 ? current + 1 : 1;
      } else {
        current = 1;
      }
      best = Math.max(best, current);
      prevDate = d;
    });
    return best;
  }

  function renderStats(){
    document.getElementById("stat-streak").textContent = computeStreak();
    document.getElementById("stat-best-streak").textContent = computeBestStreak();
    document.getElementById("stat-total-days").textContent = Object.keys(store.days).filter(isDayPartial).length;

    let rateSum = 0, rateCount = 30;
    for(let i=0;i<30;i++){
      const key = dateKeyOffset(i);
      const c = dayCompletion(key);
      rateSum += (c.morning + c.evening + c.sleep) / 3;
    }
    document.getElementById("stat-rate30").textContent = Math.round((rateSum/rateCount)*100) + "%";

    // خريطة حرارية لآخر 30 يومًا (من الأقدم إلى الأحدث)
    const heat = document.getElementById("heatmap");
    heat.innerHTML = "";
    for(let i=29;i>=0;i--){
      const key = dateKeyOffset(i);
      const c = dayCompletion(key);
      const sessionsFull = [c.morning, c.evening, c.sleep].filter(v => v >= 1).length;
      let level = 0;
      if(sessionsFull === 3) level = 3;
      else if(sessionsFull >= 1) level = 2;
      else if(isDayPartial(key)) level = 1;
      const cell = document.createElement("div");
      cell.className = `hm-cell hm-${level}`;
      cell.title = key;
      heat.appendChild(cell);
    }

    // رسم بياني للأسبوع الحالي (آخر 7 أيام)
    const bar = document.getElementById("barchart");
    bar.innerHTML = "";
    const dayNames = ["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
    for(let i=6;i>=0;i--){
      const key = dateKeyOffset(i);
      const c = dayCompletion(key);
      const pct = Math.round(((c.morning + c.evening + c.sleep)/3)*100);
      const col = document.createElement("div");
      col.className = "bar-col";
      const d = new Date(key);
      col.innerHTML = `<div class="bar" style="height:${Math.max(pct,2)}%" title="${pct}%"></div><span class="bar-day">${dayNames[d.getDay()]}</span>`;
      bar.appendChild(col);
    }
  }

  /* ---------------- النسخ الاحتياطي ---------------- */
  document.getElementById("btn-export").addEventListener("click", () => {
    const dataStr = JSON.stringify(store, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `azkar-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById("import-status");
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try{
        const imported = JSON.parse(ev.target.result);
        if(!imported || typeof imported !== "object" || !imported.days){
          throw new Error("صيغة الملف غير صحيحة");
        }
        // دمج البيانات المستوردة مع الحالية (الملف المستورد له الأولوية عند التعارض)
        Object.keys(imported.days).forEach(key => {
          store.days[key] = imported.days[key];
        });
        saveStore(store);
        statusEl.textContent = "تم استيراد النسخة الاحتياطية ودمجها بنجاح ✓";
        statusEl.style.color = "#2E7D46";
        renderList("morning");
        renderList("evening");
        renderList("sleep");
      }catch(err){
        console.error(err);
        statusEl.textContent = "تعذّر قراءة الملف. تأكد أنه ملف نسخة احتياطية صحيح.";
        statusEl.style.color = "#B4232C";
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-wipe").addEventListener("click", () => {
    if(!confirm("سيتم حذف جميع بيانات المتابعة نهائيًا من هذا الجهاز. هل أنت متأكد؟")) return;
    store = { days: {} };
    saveStore(store);
    renderList("morning");
    renderList("evening");
    renderList("sleep");
    alert("تم حذف جميع البيانات.");
  });

  /* ---------------- التشغيل الأولي ---------------- */
  function init(){
    renderList("morning");
    renderList("evening");
    renderList("sleep");
    // اختيار التبويب الافتراضي حسب الوقت الحالي: قبل الظهر صباح، بعده مساء
    const hour = new Date().getHours();
    activateTab(hour >= 15 || hour < 3 ? "evening" : "morning");
  }
  init();

})();
