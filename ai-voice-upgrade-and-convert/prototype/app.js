const mainTabs = document.querySelectorAll('.rail-tab');
    const canvasRoot = document.getElementById('canvasRoot');
    const audioListView = document.getElementById('audioListView');
    const ttsTextField = document.getElementById('ttsTextField');
    const ttsEmotionField = document.getElementById('ttsEmotionField');
    const ttsSpeedField = document.getElementById('ttsSpeedField');
    const voiceField = document.getElementById('voiceField');
    const volumeField = document.getElementById('volumeField');
    const sideTitle = document.getElementById('sideTitle');
    const sideListView = document.getElementById('sideListView');
    const voiceChips = document.querySelectorAll('.chip[data-voice]');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const primaryAction = document.getElementById('primaryAction');
    const primaryActionLabel = document.getElementById('primaryActionLabel');
    const secondaryAction = document.getElementById('secondaryAction');
    const actionHelper = document.getElementById('actionHelper');
    const actionHelperText = document.getElementById('actionHelperText');
    const actionsPanel = document.querySelector('.actions');
    const moreMenu = document.getElementById('moreMenu');
    const uploadAudioAction = document.getElementById('uploadAudioAction');
    const audioFileInput = document.getElementById('audioFileInput');
    const vcRecordingStrip = document.getElementById('vcRecordingStrip');
    const vcResultStrip = document.getElementById('vcResultStrip');
    const vcResultActions = document.getElementById('vcResultActions');
    const previewOriginalBtn = document.getElementById('previewOriginalBtn');
    const previewConvertedBtn = document.getElementById('previewConvertedBtn');
    const regenTopBtn = document.getElementById('regenTopBtn');
    const discardBtn = document.getElementById('discardBtn');
    const saveReviewBtn = document.getElementById('saveReviewBtn');
    const processingOverlay = document.getElementById('processingOverlay');
    const processingDesc = document.getElementById('processingDesc');

    const listDataByTab = {
      tts: [
        { name: '可爱少女_音频_424', desc: '医生套装限时折扣中，马上恢复原价，心动的话快行动吧！', reviewing: false },
        { name: '单纯少年_音频_411', desc: '恭喜你完成治疗所有的艾比，终点已出现在医院对面，你可以选择通关，也可以继续探索小镇的风光哦。', reviewing: false },
        { name: '蛋小黄_音频_409', desc: '找不到艾比时可以使用召唤功能寻找艾比哦。', reviewing: false },
        { name: '青年男性_音频_407', desc: '当前页仅新增“服务升级”角标，其余 AI 朗读交互不做改动。', reviewing: false }
      ],
      vc: [
        { name: '可爱少女_转换音频_201', desc: '状态：已保存。可在这里直接试听、继续替换或删除。', reviewing: false },
        { name: '青年男声_转换音频_198', desc: '状态：已保存。转换完成后会归档到自定义文件列表。', reviewing: false },
        { name: '可爱少女_转换音频_195', desc: '状态：审核中。审核完成后自动可试听。', reviewing: true },
        { name: '单纯少年_转换音频_305', desc: '状态：审核中。审核完成后自动可试听。', reviewing: true }
      ]
    };

    let activeTab = 'tts';
    let vcFlowState = 'idle';
    let flowTimerA = null;
    let flowTimerB = null;
    let recordingTick = null;
    let recordingSeconds = 8;
    let lastGeneratedSettings = null;
    let pressRecordPointerId = null;
    let pressStartY = 0;
    let recordCancelIntent = false;
    const recordCancelThreshold = 90;

    function renderList(tabName) {
      const rows = listDataByTab[tabName] || [];
      audioListView.innerHTML = rows.map((row) => `
        <div class="saved-item">
          <div class="saved-play${row.reviewing ? ' disabled' : ''}">◀</div>
          <div>
            <div class="saved-name">${row.name}</div>
            <div class="saved-desc${row.reviewing ? ' reviewing-status' : ''}">${
              tabName === 'vc'
                ? (row.temp ? '待保存，可试听后点击保存' : (row.reviewing ? '审核中，完成可试听' : ''))
                : row.desc
            }</div>
          </div>
          <div class="saved-dot"></div>
        </div>
      `).join('');
    }

    function applyIPhoneScale() {
      const designW = 2532;
      const designH = 1170;
      const scale = Math.min(window.innerWidth / designW, window.innerHeight / designH);
      canvasRoot.style.transform = `scale(${scale})`;
    }

    function clearFlowTimers() {
      clearTimeout(flowTimerA);
      clearTimeout(flowTimerB);
      flowTimerA = null;
      flowTimerB = null;
    }

    function stopRecordingTick() {
      clearInterval(recordingTick);
      recordingTick = null;
    }

    function startRecordingTick() {
      stopRecordingTick();
      recordingSeconds = 8;
      recordingTick = setInterval(() => {
        recordingSeconds += 1;
      }, 1000);
    }

    function setRecordCancelIntent(isCancelIntent) {
      recordCancelIntent = isCancelIntent;
      actionHelper.classList.toggle('recording-hint', !isCancelIntent);
      actionHelper.classList.toggle('cancel-hint', isCancelIntent);
      primaryAction.classList.toggle('recording-cancel', isCancelIntent);
      primaryAction.classList.toggle('recording-ready', !isCancelIntent);
      primaryActionLabel.textContent = isCancelIntent ? '松手取消' : '松手后开始转换';
      actionHelperText.textContent = isCancelIntent ? '上滑后松手将取消' : '上滑可取消';
    }

    function getCurrentSettings() {
      const activeVoice = document.querySelector('.chip.active[data-voice]');
      return {
        voice: activeVoice ? activeVoice.dataset.voice : '蛋小黄',
        volume: Number(volumeSlider.value)
      };
    }

    function syncVolumeLabel() {
      volumeValue.textContent = volumeSlider.value;
    }

    function updateRegenAvailability() {
      const canCompare = activeTab === 'vc' && vcFlowState === 'ready' && lastGeneratedSettings;
      if (!canCompare) {
        regenTopBtn.disabled = true;
        regenTopBtn.classList.remove('active');
        return;
      }
      const current = getCurrentSettings();
      const changed = current.voice !== lastGeneratedSettings.voice || current.volume !== lastGeneratedSettings.volume;
      regenTopBtn.disabled = !changed;
      regenTopBtn.classList.toggle('active', changed);
    }

    function submitLatestTempToReview() {
      const idx = listDataByTab.vc.findIndex((item) => item.temp === true);
      if (idx < 0) {
        return;
      }
      listDataByTab.vc[idx].temp = false;
      listDataByTab.vc[idx].reviewing = true;
      listDataByTab.vc[idx].desc = '状态：审核中。审核完成后自动可试听。';
      renderList('vc');
    }

    function discardLatestTempResult() {
      const idx = listDataByTab.vc.findIndex((item) => item.temp === true);
      if (idx < 0) {
        return;
      }
      listDataByTab.vc.splice(idx, 1);
      renderList('vc');
      setVCFlowState('idle');
    }

    function closeMoreMenu() {
      moreMenu.hidden = true;
    }

    function setVCFlowState(nextState) {
      vcFlowState = nextState;
      if (activeTab !== 'vc') {
        return;
      }
      if (nextState === 'idle' || nextState === 'ready') {
        stopRecordingTick();
        pressRecordPointerId = null;
        setRecordCancelIntent(false);
        processingOverlay.hidden = true;
        vcRecordingStrip.hidden = true;
        vcResultStrip.hidden = nextState === 'idle';
        vcResultActions.hidden = nextState === 'idle';
        actionsPanel.hidden = nextState === 'ready';
        actionsPanel.classList.remove('recording-mode');
        actionHelper.hidden = true;
        actionHelper.classList.remove('recording-hint', 'cancel-hint');
        sideListView.classList.toggle('result-mode', nextState === 'ready');
        sideTitle.hidden = nextState === 'ready';
        primaryActionLabel.textContent = '按住录音';
        primaryAction.classList.remove('recording-ready', 'recording-cancel');
        primaryAction.disabled = false;
        secondaryAction.disabled = false;
        discardBtn.disabled = nextState === 'idle';
        saveReviewBtn.disabled = nextState === 'idle';
        if (nextState === 'idle') {
          actionsPanel.hidden = false;
          sideTitle.textContent = '生成参数';
          sideTitle.hidden = false;
          sideListView.scrollTop = 0;
          regenTopBtn.disabled = true;
          regenTopBtn.classList.remove('active');
        } else {
          sideListView.scrollTop = 0;
          updateRegenAvailability();
        }
      } else if (nextState === 'recording') {
        startRecordingTick();
        setRecordCancelIntent(false);
        actionHelperText.textContent = '上滑可取消';
        actionHelper.hidden = false;
        actionsPanel.classList.add('recording-mode');
        primaryAction.disabled = false;
        secondaryAction.disabled = true;
        vcRecordingStrip.hidden = false;
        vcResultStrip.hidden = true;
        vcResultActions.hidden = true;
        actionsPanel.hidden = false;
        processingOverlay.hidden = true;
        sideTitle.textContent = '生成参数';
        sideTitle.hidden = false;
        sideListView.classList.remove('result-mode');
        sideListView.scrollTop = 0;
        regenTopBtn.disabled = true;
        discardBtn.disabled = true;
        saveReviewBtn.disabled = true;
        closeMoreMenu();
      } else if (nextState === 'processing') {
        stopRecordingTick();
        pressRecordPointerId = null;
        setRecordCancelIntent(false);
        actionHelper.hidden = true;
        actionHelper.classList.remove('recording-hint', 'cancel-hint');
        actionsPanel.classList.remove('recording-mode');
        primaryActionLabel.textContent = '处理中...';
        primaryAction.classList.remove('recording-ready', 'recording-cancel');
        primaryAction.disabled = true;
        secondaryAction.disabled = true;
        regenTopBtn.disabled = true;
        discardBtn.disabled = true;
        saveReviewBtn.disabled = true;
        vcRecordingStrip.hidden = true;
        vcResultStrip.hidden = true;
        vcResultActions.hidden = true;
        actionsPanel.hidden = true;
        processingOverlay.hidden = false;
        sideTitle.hidden = true;
        sideListView.classList.remove('result-mode');
        processingDesc.textContent = '请稍候，处理中暂不可操作';
        closeMoreMenu();
      }
    }

    function pushTempResultToTop() {
      listDataByTab.vc.unshift({
        name: `新录音_转换音频_${Math.floor(100 + Math.random() * 900)}`,
        desc: '状态：待保存。可试听后点击保存并提交审核。',
        reviewing: false,
        temp: true
      });
      renderList('vc');
    }

    function runAutoConvertFlow() {
      clearFlowTimers();
      setVCFlowState('processing');
      flowTimerB = setTimeout(() => {
        lastGeneratedSettings = getCurrentSettings();
        pushTempResultToTop();
        setVCFlowState('ready');
      }, 2900);
    }

    function beginPressRecording(event) {
      if (activeTab !== 'vc' || vcFlowState !== 'idle') {
        return;
      }
      pressRecordPointerId = event.pointerId;
      pressStartY = event.clientY;
      primaryAction.setPointerCapture?.(event.pointerId);
      setVCFlowState('recording');
    }

    function updatePressRecording(event) {
      if (vcFlowState !== 'recording' || pressRecordPointerId !== event.pointerId) {
        return;
      }
      const movedUp = pressStartY - event.clientY > recordCancelThreshold;
      setRecordCancelIntent(movedUp);
    }

    function finishPressRecording(event, wasCancelledByPointer = false) {
      if (vcFlowState !== 'recording' || pressRecordPointerId !== event.pointerId) {
        return;
      }
      primaryAction.releasePointerCapture?.(event.pointerId);
      pressRecordPointerId = null;
      const shouldCancel = wasCancelledByPointer || recordCancelIntent;
      setRecordCancelIntent(false);
      if (shouldCancel) {
        setVCFlowState('idle');
        return;
      }
      runAutoConvertFlow();
    }

    function switchMainTab(tabName) {
      activeTab = tabName;
      mainTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
      const isTTS = tabName === 'tts';
      ttsTextField.hidden = !isTTS;
      ttsEmotionField.hidden = !isTTS;
      ttsSpeedField.hidden = !isTTS;
      voiceField.hidden = false;
      volumeField.hidden = false;
      sideTitle.textContent = '生成参数';
      sideTitle.hidden = false;
      sideListView.classList.remove('result-mode');
      primaryActionLabel.textContent = isTTS ? 'AI朗读' : '按住录音';
      secondaryAction.textContent = isTTS ? '保存' : '...';
      secondaryAction.classList.toggle('menu', !isTTS);
      secondaryAction.setAttribute('aria-label', isTTS ? '保存' : '更多操作');
      primaryAction.disabled = false;
      secondaryAction.disabled = false;
      closeMoreMenu();
      renderList(tabName);
      syncVolumeLabel();
      if (!isTTS) {
        ttsTextField.hidden = true;
        ttsEmotionField.hidden = true;
        ttsSpeedField.hidden = true;
        vcRecordingStrip.hidden = vcFlowState !== 'recording';
        vcResultStrip.hidden = vcFlowState === 'idle';
        vcResultActions.hidden = vcFlowState === 'idle';
        setVCFlowState(vcFlowState);
      } else {
        clearFlowTimers();
        stopRecordingTick();
        processingOverlay.hidden = true;
        vcRecordingStrip.hidden = true;
        vcResultStrip.hidden = true;
        vcResultActions.hidden = true;
        actionsPanel.hidden = false;
      }
    }

    mainTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchMainTab(tab.dataset.tab));
    });

    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const group = chip.parentElement.querySelectorAll('.chip');
        group.forEach((item) => item.classList.remove('active'));
        chip.classList.add('active');
        updateRegenAvailability();
      });
    });

    volumeSlider.addEventListener('input', () => {
      syncVolumeLabel();
      updateRegenAvailability();
    });

    primaryAction.addEventListener('pointerdown', (event) => {
      if (activeTab === 'tts') {
        return;
      }
      event.preventDefault();
      beginPressRecording(event);
    });

    primaryAction.addEventListener('pointermove', (event) => {
      updatePressRecording(event);
    });

    primaryAction.addEventListener('pointerup', (event) => {
      finishPressRecording(event);
    });

    primaryAction.addEventListener('pointercancel', (event) => {
      finishPressRecording(event, true);
    });

    primaryAction.addEventListener('lostpointercapture', (event) => {
      if (vcFlowState === 'recording' && pressRecordPointerId === event.pointerId) {
        finishPressRecording(event, true);
      }
    });

    secondaryAction.addEventListener('click', () => {
      if (activeTab === 'tts') {
        return;
      }
      if (secondaryAction.disabled) {
        return;
      }
      moreMenu.hidden = !moreMenu.hidden;
    });

    uploadAudioAction.addEventListener('click', () => {
      closeMoreMenu();
      audioFileInput.click();
    });

    audioFileInput.addEventListener('change', () => {
      if (audioFileInput.files && audioFileInput.files.length > 0) {
        runAutoConvertFlow();
      }
    });

    previewOriginalBtn.addEventListener('click', () => {
    });

    previewConvertedBtn.addEventListener('click', () => {
    });

    regenTopBtn.addEventListener('click', () => {
      if (activeTab !== 'vc' || vcFlowState !== 'ready') {
        return;
      }
      runAutoConvertFlow();
    });

    discardBtn.addEventListener('click', () => {
      if (activeTab !== 'vc' || vcFlowState !== 'ready') {
        return;
      }
      discardLatestTempResult();
    });

    saveReviewBtn.addEventListener('click', () => {
      if (activeTab !== 'vc' || vcFlowState !== 'ready') {
        return;
      }
      submitLatestTempToReview();
    });

    document.addEventListener('click', (event) => {
      if (activeTab !== 'vc' || moreMenu.hidden) {
        return;
      }
      const target = event.target;
      if (!moreMenu.contains(target) && !secondaryAction.contains(target)) {
        closeMoreMenu();
      }
    });

    window.addEventListener('resize', applyIPhoneScale);
    applyIPhoneScale();
    syncVolumeLabel();
    renderList('tts');
    vcResultStrip.hidden = true;
