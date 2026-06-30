// ─── GitHub raw URL ───────────────────────────────
const INTERNSHIP_URL = 'https://raw.githubusercontent.com/yyj0609/public_data/main/public/data/internship_jobs.json';
const CAREER_URL     = 'https://raw.githubusercontent.com/yyj0609/public_data/main/public/data/general_jobs.json';

// ─── 상태 ────────────────────────────────────────
let ALL_DATA        = [];
let currentJobType  = 'all';
let currentFilter   = 'all';
let currentWorkType = 'all';
let currentSort     = 'newest';
let currentView     = 'card';
let searchQuery     = '';
let activeKeyword   = '';
let favorites       = JSON.parse(localStorage.getItem('gri_favorites') || '[]');
let lastVisit       = localStorage.getItem('gri_lastVisit') || null;
let mapInstance     = null;
let chartCountry    = null;
let chartKeyword    = null;
let statsOpen       = false;

// 방문 시간 기록

// ─── 유틸 ────────────────────────────────────────
function getLocationType(title) {
  return title.includes('[Domestic]') ? 'domestic' : 'overseas';
}

function cleanTitle(title) {
  return title
    .replace(/\[(Domestic|Overseas)\]/g, '')
    .replace(/\[(Internship|Career)\]/g, '')
    .trim();
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function getCountryFlag(country) {
  const flags = {
    'South Korea':'🇰🇷','United States':'🇺🇸','United States of America':'🇺🇸',
    'France':'🇫🇷','Italy':'🇮🇹','Indonesia':'🇮🇩','United Arab Emirates':'🇦🇪',
    'Austria':'🇦🇹','Malawi':'🇲🇼','Switzerland':'🇨🇭','Jordan':'🇯🇴',
    'Kenya':'🇰🇪','Canada':'🇨🇦','Thailand':'🇹🇭','Various':'🌐'
  };
  return flags[country] || '🌍';
}

// ─── NEW 배지 (매일 새벽 2시 업데이트 기준) ─────────
function isNew(regDt) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');

  // 새벽 2시 이전(0~2시)이면 어제가 최신 업데이트 날짜
  let baseDate;
  if (now.getHours() < 2) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    baseDate = `${yesterday.getFullYear()}-${pad(yesterday.getMonth()+1)}-${pad(yesterday.getDate())}`;
  } else {
    baseDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  }

  return regDt === baseDate;
}

// ─── 마감일 / D-day ──────────────────────────────
function extractDeadline(summary) {
  const m = summary.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function getDday(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((deadline - today) / 86400000);
  if (diff < 0)  return { text: '마감',      cls: 'closed' };
  if (diff === 0) return { text: 'D-Day',    cls: 'urgent' };
  if (diff <= 7)  return { text: `D-${diff}`, cls: 'urgent' };
  return { text: `D-${diff}`, cls: '' };
}

// ─── 즐겨찾기 ────────────────────────────────────
function toggleFav(seq, e) {
  e.stopPropagation();
  const idx = favorites.indexOf(seq);
  if (idx === -1) favorites.push(seq);
  else            favorites.splice(idx, 1);
  localStorage.setItem('gri_favorites', JSON.stringify(favorites));
  render();
  showToast(idx === -1 ? '❤️ 즐겨찾기에 추가했어요' : '즐겨찾기에서 제거했어요');
}
function isFav(seq) { return favorites.includes(seq); }

// ─── 공유 ────────────────────────────────────────
function shareItem(seq, e) {
  if (e) e.stopPropagation();
  const url = `${location.href.split('?')[0]}?seq=${seq}`;
  navigator.clipboard.writeText(url).catch(() => {});
  showToast('🔗 링크가 복사되었어요');
}

// ─── 키워드 클릭 필터 ────────────────────────────
function clickKeyword(kw, e) {
  e.stopPropagation();
  activeKeyword = (activeKeyword === kw) ? '' : kw;
  searchQuery   = activeKeyword;
  document.getElementById('searchInput').value = activeKeyword;

  const activeDiv  = document.getElementById('activeKeyword');
  const activeText = document.getElementById('activeKeywordText');
  if (activeKeyword) {
    activeDiv.style.display = 'flex';
    activeText.textContent  = `🏷 ${activeKeyword}`;
    document.getElementById('searchClear').style.display = 'block';
  } else {
    activeDiv.style.display = 'none';
    document.getElementById('searchClear').style.display = 'none';
  }
  render();
}

// ─── 토스트 ──────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── 모달 ────────────────────────────────────────
function openModal(item) {
  const locType  = getLocationType(item.title);
  const title    = cleanTitle(item.title);
  const flag     = getCountryFlag(item.country);
  const location = item.country === 'South Korea' ? item.city : `${item.city}, ${item.country}`;
  const deadline = extractDeadline(item.ai_summary);
  const dday     = getDday(deadline);
  const isMailto = item.applyUrl.startsWith('mailto:');

  const jobBadge = item.jobType === 'internship'
    ? '<span class="badge" style="background:#E8F0FE;color:#1A5FA8;">🎓 인턴십</span>'
    : '<span class="badge badge-career">💼 정규직</span>';
  const locBadge = locType === 'domestic'
    ? '<span class="badge badge-domestic">국내</span>'
    : '<span class="badge badge-overseas">해외</span>';
  const ddayHTML = dday ? `<span class="dday-badge ${dday.cls}">${dday.text}</span>` : '';
  const newHTML  = isNew(item.regDt) ? '<span class="badge-new">NEW</span>' : '';

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-badges">${jobBadge}${locBadge}${ddayHTML}${newHTML}</div>
    <p class="modal-title">${title}</p>
    <p class="modal-location">${flag} ${location} · ${item.workType === 'Hybrid' ? '하이브리드' : '현장근무'} · 등록 ${formatDate(item.regDt)}</p>
    <p class="modal-section-label">요약</p>
    <p class="modal-summary">${item.ai_summary}</p>
    <p class="modal-section-label">키워드</p>
    <div class="modal-keywords">
      ${(item.ai_keywords || []).map(k =>
        `<span class="kw-tag" onclick="clickKeywordFromModal('${k.replace(/'/g,"\\'")}')">
          ${k}
        </span>`
      ).join('')}
    </div>
    <div class="modal-footer">
      <button class="modal-share-btn" onclick="shareItem('${item.seq}')">🔗 링크 복사</button>
      <a class="modal-apply-btn" href="${item.applyUrl}"
          target="${isMailto ? '_self' : '_blank'}" rel="noopener">
        ${isMailto ? '📧 이메일 지원' : '지원하기 →'}
      </a>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function clickKeywordFromModal(kw) {
  closeModal();
  clickKeyword(kw, { stopPropagation: () => {} });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ─── 필터 ────────────────────────────────────────
function getFiltered() {
  let data = ALL_DATA.filter(item => {
    const locType = getLocationType(item.title);
    if (currentJobType === 'fav'  && !isFav(item.seq))               return false;
    if (currentJobType !== 'all'  && currentJobType !== 'fav'
        && item.jobType !== currentJobType)                            return false;
    if (currentFilter  !== 'all'  && locType !== currentFilter)       return false;
    if (currentWorkType !== 'all' && item.workType !== currentWorkType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const target = [cleanTitle(item.title), item.city, item.country,
        ...(item.ai_keywords || []), item.ai_summary].join(' ').toLowerCase();
      if (!target.includes(q)) return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const da = new Date(a.regDt), db = new Date(b.regDt);
    return currentSort === 'newest' ? db - da : da - db;
  });
  return data;
}

// ─── 카드 렌더링 ──────────────────────────────────
function renderCard(item) {
  const locType  = getLocationType(item.title);
  const title    = cleanTitle(item.title);
  const flag     = getCountryFlag(item.country);
  const location = item.country === 'South Korea' ? item.city : `${item.city}, ${item.country}`;
  const keywords = (item.ai_keywords || []).slice(0, 3);
  const isMailto = item.applyUrl.startsWith('mailto:');
  const favIcon  = isFav(item.seq) ? '❤️' : '🤍';
  const deadline = extractDeadline(item.ai_summary);
  const dday     = getDday(deadline);

  const jobBadge  = item.jobType === 'internship'
    ? '<span class="badge" style="background:#E8F0FE;color:#1A5FA8;">🎓 인턴십</span>'
    : '<span class="badge badge-career">💼 정규직</span>';
  const locBadge  = locType === 'domestic'
    ? '<span class="badge badge-domestic">국내</span>'
    : '<span class="badge badge-overseas">해외</span>';
  const workBadge = item.workType === 'Hybrid'
    ? '<span class="badge badge-hybrid">하이브리드</span>'
    : '<span class="badge badge-onsite">현장근무</span>';
  const ddayHTML  = dday ? `<span class="dday-badge ${dday.cls}">${dday.text}</span>` : '';
  const newHTML   = isNew(item.regDt) ? '<span class="badge-new">NEW</span>' : '';

  const itemJSON = JSON.stringify(item).replace(/"/g, '&quot;');

  return `
    <div class="card" onclick="openModal(JSON.parse(this.dataset.item))" data-item="${itemJSON}">
      <button class="fav-btn" onclick="toggleFav('${item.seq}', event)">${favIcon}</button>
      <div class="card-top">${jobBadge}${locBadge}${workBadge}${ddayHTML}${newHTML}</div>
      <p class="card-title">${title}</p>
      <div class="card-location"><span>${flag}</span>${location}</div>
      <div class="card-keywords">
        ${keywords.map(k => {
          const isActive = k === activeKeyword;
          return `<span class="kw-tag ${isActive ? 'active-kw' : ''}"
            onclick="clickKeyword('${k.replace(/'/g,"\\'")}', event)">${k}</span>`;
        }).join('')}
      </div>
      <p class="card-summary">${item.ai_summary}</p>
      <div class="card-footer">
        <span class="card-date">등록 ${formatDate(item.regDt)}</span>
        <div class="card-actions">
          <button class="share-btn" onclick="shareItem('${item.seq}', event)">🔗</button>
          <a class="apply-btn" href="${item.applyUrl}"
              target="${isMailto ? '_self' : '_blank'}" rel="noopener"
              onclick="event.stopPropagation()">
            ${isMailto ? '📧 이메일' : '지원하기 →'}
          </a>
        </div>
      </div>
    </div>`;
}

// ─── 지도 렌더링 (수정: 지도 반복 방지) ──────────
function renderMap(filtered) {
  if (!mapInstance) {
    mapInstance = L.map('map', {
      minZoom: 2,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false
    }).setView([20, 10], 2);

    // 지구가 한 번만 보이도록 경계 설정
    mapInstance.setMaxBounds([[-85, -180], [85, 180]]);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      noWrap: true  // 타일 반복 방지
    }).addTo(mapInstance);
  } else {
    mapInstance.eachLayer(l => { if (l instanceof L.Marker) mapInstance.removeLayer(l); });
  }

  const groups = {};
  filtered.forEach(item => {
    if (!item.lat || !item.lng) return;
    const key = `${item.lat},${item.lng}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  Object.values(groups).forEach(items => {
    const { lat, lng } = items[0];
    const flag = getCountryFlag(items[0].country);
    const location = items[0].country === 'South Korea'
      ? items[0].city : `${items[0].city}, ${items[0].country}`;

    const icon = L.divIcon({
      html: `<div style="background:#1A5FA8;color:#fff;border-radius:50%;width:34px;height:34px;
        display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;
        border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${items.length}</div>`,
      className: '', iconSize: [34, 34], iconAnchor: [17, 17]
    });

    const popupHTML = `
      <div style="min-width:200px;">
        <p style="font-weight:700;margin-bottom:8px;">${flag} ${location}</p>
        ${items.slice(0, 3).map(i => `
          <div style="padding:6px 0;border-top:1px solid #f0f0f0;">
            <p style="font-size:12px;font-weight:600;margin-bottom:4px;">${cleanTitle(i.title)}</p>
            <a href="${i.applyUrl}" target="${i.applyUrl.startsWith('mailto:') ? '_self' : '_blank'}"
                style="font-size:11px;color:#1A5FA8;text-decoration:none;">
              ${i.applyUrl.startsWith('mailto:') ? '📧 이메일 지원' : '지원하기 →'}
            </a>
          </div>`).join('')}
        ${items.length > 3 ? `<p style="font-size:11px;color:#aaa;margin-top:6px;">외 ${items.length - 3}개 더보기</p>` : ''}
      </div>`;

    L.marker([lat, lng], { icon }).addTo(mapInstance).bindPopup(popupHTML);
  });

  setTimeout(() => mapInstance.invalidateSize(), 100);
}

// ─── 통계 대시보드 ────────────────────────────────
function renderStats() {
  document.getElementById('statTotal').textContent   = ALL_DATA.length;
  document.getElementById('statIntern').textContent  = ALL_DATA.filter(d => d.jobType === 'internship').length;
  document.getElementById('statCareer').textContent  = ALL_DATA.filter(d => d.jobType === 'career').length;
  document.getElementById('statOverseas').textContent= ALL_DATA.filter(d => getLocationType(d.title) === 'overseas').length;

  // 국가별 공고 수 (상위 8)
  const countryCounts = {};
  ALL_DATA.forEach(d => {
    const c = d.country === 'United States of America' ? 'United States' : d.country;
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  });
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 8);

  const countryLabels = topCountries.map(([c]) => {
    const map = { 'South Korea': '한국', 'United States': '미국', 'France': '프랑스',
      'Switzerland': '스위스', 'Jordan': '요르단', 'Austria': '오스트리아',
      'Italy': '이탈리아', 'Indonesia': '인도네시아', 'Kenya': '케냐',
      'Canada': '캐나다', 'Thailand': '태국', 'Various': '다국가', 'Malawi': '말라위' };
    return map[c] || c;
  });

  if (chartCountry) chartCountry.destroy();
  chartCountry = new Chart(document.getElementById('countryChart'), {
    type: 'bar',
    data: {
      labels: countryLabels,
      datasets: [{ data: topCountries.map(([,v]) => v),
        backgroundColor: '#1A5FA8', borderRadius: 6 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // 키워드 빈도 (상위 10)
  const kwCounts = {};
  ALL_DATA.forEach(d => (d.ai_keywords || []).forEach(k => {
    kwCounts[k] = (kwCounts[k] || 0) + 1;
  }));
  const topKw = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const colors = ['#1A5FA8','#2E7D32','#8B1A6B','#C25A00','#6A3DB5',
    '#0277BD','#558B2F','#AD1457','#E65100','#4527A0'];

  if (chartKeyword) chartKeyword.destroy();
  chartKeyword = new Chart(document.getElementById('keywordChart'), {
    type: 'doughnut',
    data: {
      labels: topKw.map(([k]) => k),
      datasets: [{ data: topKw.map(([,v]) => v), backgroundColor: colors }]
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } }
      }
    }
  });
}

// ─── 전체 렌더 ────────────────────────────────────
function render() {
  const filtered = getFiltered();
  const grid     = document.getElementById('cardGrid');
  const mapView  = document.getElementById('mapView');
  const empty    = document.getElementById('emptyState');

  document.getElementById('resultCount').textContent = filtered.length;

  if (currentView === 'map') {
    grid.style.display    = 'none';
    mapView.style.display = 'block';
    empty.style.display   = 'none';
    renderMap(filtered);
    return;
  }

  mapView.style.display = 'none';
  grid.style.display    = 'grid';

  if (filtered.length === 0) {
    grid.innerHTML = ''; empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtered.map(renderCard).join('');
  }
}

function updateTabCounts() {
  const base = ALL_DATA.filter(i =>
    currentJobType === 'fav' ? isFav(i.seq) :
    currentJobType === 'all' ? true : i.jobType === currentJobType
  );
  document.getElementById('count-all').textContent      = base.length;
  document.getElementById('count-domestic').textContent = base.filter(i => getLocationType(i.title) === 'domestic').length;
  document.getElementById('count-overseas').textContent = base.filter(i => getLocationType(i.title) === 'overseas').length;
}

// ─── 데이터 로딩 ─────────────────────────────────
async function loadData() {
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('cardGrid').style.display     = 'none';
  try {
    const [internships, careers] = await Promise.all([
      fetch(INTERNSHIP_URL).then(r => r.json()),
      fetch(CAREER_URL).then(r => r.json())
    ]);
    ALL_DATA = [
      ...internships.map(d => ({ ...d, jobType: 'internship' })),
      ...careers.map(d => ({ ...d, jobType: 'career' }))
    ];
    updateTabCounts();
    renderStats();
    render();
  } catch (err) {
    console.error('데이터 로딩 실패:', err);
    document.getElementById('loadingState').innerHTML =
      '<p style="color:#c00;text-align:center;padding:40px;">데이터를 불러오지 못했어요.</p>';
    return;
  }
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('cardGrid').style.display     = 'grid';
}

// ─── 이벤트 ──────────────────────────────────────
// 통계 패널
document.getElementById('statsToggleBtn').addEventListener('click', () => {
  statsOpen = !statsOpen;
  document.getElementById('statsPanel').style.display = statsOpen ? 'block' : 'none';
  document.getElementById('statsToggleBtn').classList.toggle('active', statsOpen);
  if (statsOpen && ALL_DATA.length) renderStats();
});

// 직종 탭
document.querySelectorAll('.job-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.job-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentJobType = tab.dataset.jobtype;
    updateTabCounts(); render();
  });
});

// 뷰 전환
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    render();
  });
});

// 국내/해외 탭
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    render();
  });
});

// 검색
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery   = e.target.value.trim();
  activeKeyword = '';
  document.getElementById('activeKeyword').style.display = 'none';
  document.getElementById('searchClear').style.display   = searchQuery ? 'block' : 'none';
  render();
});

// 검색 초기화
document.getElementById('searchClear').addEventListener('click', () => {
  searchQuery   = ''; activeKeyword = '';
  document.getElementById('searchInput').value           = '';
  document.getElementById('searchClear').style.display   = 'none';
  document.getElementById('activeKeyword').style.display = 'none';
  render();
});

// 키워드 초기화
document.getElementById('clearKeyword').addEventListener('click', () => {
  searchQuery   = ''; activeKeyword = '';
  document.getElementById('searchInput').value           = '';
  document.getElementById('searchClear').style.display   = 'none';
  document.getElementById('activeKeyword').style.display = 'none';
  render();
});

// 근무형태 / 정렬
document.getElementById('workTypeFilter').addEventListener('change', e => { currentWorkType = e.target.value; render(); });
document.getElementById('sortFilter').addEventListener('change', e => { currentSort = e.target.value; render(); });

// 모달
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ─── 시작 ────────────────────────────────────────
loadData();
