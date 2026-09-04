(function(){

  /* Inventory and sourcing come from the JSON database in /data.
     See data/sources.json for the EU regulations and reuse channels behind each item. */
  var products = [];
  var sources = { regulations: [], channels: [] };
  var channelById = {};
  var regById = {};


  var LABELS = {
    style:{business:'Business', casual:'Casual', party:'Party', athletic:'Athletic'},
    types:{'tops':'Tops','bottoms':'Bottoms','dresses':'Dresses','bathing suits':'Bathing suits','two-piece sets':'Two-piece sets','shoes':'Shoes','jackets':'Jackets','intimates':'Intimates'},
    audience:{women:'Women', unisex:'Unisex', men:'Men', kids:'Kids'},
    materials:{silks:'Silks', polyester:'Polyester', wool:'Wool', 'organic cotton':'Organic cotton', nylon:'Nylon', acrylic:'Acrylic'},
    embellishments:{buttons:'Buttons', ruffles:'Ruffles', mesh:'Mesh', fringe:'Fringe', patterns:'Patterns', tags:'Tags', 'inelastic-waistband':'Inelastic waistband'},
    fit:{'pull-on':'Pulls on, no fastenings', 'one-handed':'Can be fastened one-handed', 'seated':'Cut for seated wear', 'tagless':'No sewn-in tags'}
  };

  var cart = {};
  var lastFocused = null;
  var quizAnswers = null;
  var sortMode = 'match';
  var sizeFilters = [];
  var fitFilters = [];
  var channelFilter = '';

  var liveRegion = document.getElementById('live-region');
  function announce(msg){
    liveRegion.textContent = '';
    window.setTimeout(function(){ liveRegion.textContent = msg; }, 30);
  }
  function fmt(n){ return '$' + n.toFixed(2); }
  function emit(name, detail){
    document.dispatchEvent(new CustomEvent('zera:' + name, {detail: detail || null}));
  }

  /* ============ Quiz flow ============ */
  var steps = Array.prototype.slice.call(document.querySelectorAll('#quiz-form fieldset'));
  var currentStep = 0;
  var quizForm = document.getElementById('quiz-form');
  var quizError = document.getElementById('quiz-error');
  var quizBack = document.getElementById('quiz-back');
  var quizNext = document.getElementById('quiz-next');
  var progressFill = document.getElementById('quiz-progress-fill');
  var progressLabel = document.getElementById('quiz-progress-label');

  function getStepSelections(index){
    var group = steps[index].querySelector('[data-group]').getAttribute('data-group');
    var inputs = steps[index].querySelectorAll('input[name="'+group+'"]:checked');
    return Array.prototype.map.call(inputs, function(i){ return i.value; });
  }

  /* moveFocus is false on first paint: focusing the legend at load would scroll
     the hero off screen before anyone has chosen to start the quiz. */
  function showStep(index, moveFocus){
    steps.forEach(function(f, i){ f.hidden = (i !== index); });
    quizError.hidden = true;
    quizBack.disabled = (index === 0);
    quizNext.textContent = (index === steps.length - 1) ? 'See my matches' : 'Next';
    var pct = Math.round(((index + 1) / steps.length) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = 'Question ' + (index + 1) + ' of ' + steps.length;
    var legend = steps[index].querySelector('legend');
    if(!legend) return;
    legend.setAttribute('tabindex', '-1');
    if(moveFocus !== false) legend.focus();
  }

  function transitionToStep(newIndex){
    var reduced = root.getAttribute('data-motion') === 'reduced';
    var oldFieldset = steps[currentStep];
    var delay = reduced ? 0 : 200;
    oldFieldset.classList.add('quiz-invisible');
    window.setTimeout(function(){
      currentStep = newIndex;
      showStep(currentStep);
      var newFieldset = steps[currentStep];
      newFieldset.classList.add('quiz-invisible');
      void newFieldset.offsetWidth;
      newFieldset.classList.remove('quiz-invisible');
      oldFieldset.classList.remove('quiz-invisible');
    }, delay);
  }

  var embellishmentInputs = document.querySelectorAll('input[name="embellishments"]');
  embellishmentInputs.forEach(function(input){
    input.addEventListener('change', function(){
      if(input.value === 'none' && input.checked){
        embellishmentInputs.forEach(function(other){
          if(other.value !== 'none') other.checked = false;
        });
      } else if(input.value !== 'none' && input.checked){
        embellishmentInputs.forEach(function(other){
          if(other.value === 'none') other.checked = false;
        });
      }
    });
  });

  quizNext.addEventListener('click', function(){
    var selections = getStepSelections(currentStep);
    if(selections.length === 0){
      quizError.hidden = false;
      announce('Choose at least one option to continue.');
      emit('invalid');
      return;
    }
    quizError.hidden = true;
    if(currentStep === steps.length - 1){
      finishQuiz();
    } else {
      emit('step');
      transitionToStep(currentStep + 1);
    }
  });

  quizBack.addEventListener('click', function(){
    if(currentStep === 0) return;
    transitionToStep(currentStep - 1);
  });

  document.getElementById('quiz-skip-btn').addEventListener('click', function(){
    quizAnswers = null;
    sortMode = 'name';
    document.getElementById('sort').value = 'name';
    enterShop();
    announce('Showing the full collection.');
  });

  function collectAnswers(){
    var embellishmentSelections = getStepSelections(4);
    if(embellishmentSelections.indexOf('none') !== -1){
      embellishmentSelections = [];
    }
    return {
      style: (getStepSelections(0)[0]) || null,
      types: getStepSelections(1),
      audience: (getStepSelections(2)[0]) || null,
      materials: getStepSelections(3),
      embellishments: embellishmentSelections
    };
  }

  function finishQuiz(){
    quizAnswers = collectAnswers();
    sortMode = 'match';
    document.getElementById('sort').value = 'match';
    enterShop();
    announce('Quiz complete. Showing your best matches.');
  }

  function enterShop(){
    document.getElementById('quiz-section').hidden = true;
    document.getElementById('shop-section').hidden = false;
    renderSummary();
    renderGrid();
    document.getElementById('shop-section').querySelector('h2').setAttribute('tabindex', '-1');
    document.getElementById('shop-section').querySelector('h2').focus();
    alignStoryToGrid();
  }

  document.getElementById('retake-quiz-btn').addEventListener('click', function(){
    document.getElementById('shop-section').hidden = true;
    document.getElementById('quiz-section').hidden = false;
    currentStep = 0;
    showStep(0);
    alignStoryToGrid();
  });

  function renderSummary(){
    var el = document.getElementById('quiz-summary');
    if(!quizAnswers){
      el.innerHTML = '<p>Browsing the full collection.</p>';
      return;
    }
    var parts = [];
    if(quizAnswers.style) parts.push('<strong>Style:</strong> ' + LABELS.style[quizAnswers.style]);
    if(quizAnswers.types.length) parts.push('<strong>Looking for:</strong> ' + quizAnswers.types.map(function(t){ return LABELS.types[t]; }).join(', '));
    if(quizAnswers.audience) parts.push('<strong>For:</strong> ' + LABELS.audience[quizAnswers.audience]);
    if(quizAnswers.materials.length) parts.push('<strong>Materials:</strong> ' + quizAnswers.materials.map(function(m){ return LABELS.materials[m]; }).join(', '));
    if(quizAnswers.embellishments.length) parts.push('<strong>Details:</strong> ' + quizAnswers.embellishments.map(function(e){ return LABELS.embellishments[e]; }).join(', '));
    el.innerHTML = '<p>' + parts.join('<br>') + '</p>';
  }

  /* ============ Matching + grid ============ */
  function getMatches(p){
    var matches = [];
    if(!quizAnswers) return matches;
    if(quizAnswers.style && p.style === quizAnswers.style) matches.push(LABELS.style[p.style]);
    p.types.forEach(function(t){ if(quizAnswers.types.indexOf(t) !== -1) matches.push(LABELS.types[t]); });
    if(quizAnswers.audience && p.audience === quizAnswers.audience) matches.push(LABELS.audience[p.audience]);
    p.materials.forEach(function(m){ if(quizAnswers.materials.indexOf(m) !== -1) matches.push(LABELS.materials[m]); });
    p.embellishments.forEach(function(e){ if(quizAnswers.embellishments.indexOf(e) !== -1) matches.push(LABELS.embellishments[e]); });
    return matches;
  }

  function matchesFit(p){
    if(!fitFilters.length) return true;
    var a = p.accessibility || {};
    return fitFilters.every(function(f){
      if(f === 'pull-on') return a.pull_on === true;
      if(f === 'one-handed') return a.pull_on === true || /one-handed|magnetic|one hand/i.test(a.notes || '');
      if(f === 'seated') return a.seated_friendly === true;
      if(f === 'tagless') return a.tagless === true;
      return true;
    });
  }

  function getFiltered(){
    var list = products.filter(function(p){
      if(sizeFilters.length && !p.size.some(function(s){ return sizeFilters.indexOf(s) !== -1; })) return false;
      if(!matchesFit(p)) return false;
      if(channelFilter && (!p.sourcing || p.sourcing.channel !== channelFilter)) return false;
      return true;
    });
    if(quizAnswers){
      var scored = list.map(function(p){ return {p:p, score:getMatches(p).length}; });
      var withMatches = scored.filter(function(x){ return x.score > 0; });
      var pool = withMatches.length ? withMatches : scored;
      pool.sort(function(a,b){ return b.score - a.score; });
      return pool.map(function(x){ return x.p; });
    }
    return list;
  }

  function getSorted(list){
    if(sortMode === 'match') return list;
    var copy = list.slice();
    if(sortMode === 'price-low') copy.sort(function(a,b){ return a.price - b.price; });
    if(sortMode === 'price-high') copy.sort(function(a,b){ return b.price - a.price; });
    if(sortMode === 'name') copy.sort(function(a,b){ return a.name.localeCompare(b.name); });
    return copy;
  }

  function esc(str){
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function speakIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="15" height="15">' +
      '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
      '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* Where the piece came from, and which EU rule put it back into circulation. */
  function sourceLine(p){
    if(!p.sourcing) return '';
    var ch = channelById[p.sourcing.channel];
    if(!ch) return '';
    var reg = p.sourcing.regulation ? regById[p.sourcing.regulation] : null;
    return '<p class="product-source">' +
      '<span class="source-dot" aria-hidden="true"></span>' +
      'Sourced via <strong>' + esc(ch.name) + '</strong>' + (ch.country ? ' <span class="source-cc">' + esc(ch.country) + '</span>' : '') +
      (reg ? '<span class="source-reg">' + esc(reg.badge || reg.short) + '</span>' : '') +
      '</p>';
  }

  /* CC BY and BY-SA require the credit to travel with the image, so it sits on
     the card itself rather than only on a credits page. */
  function fabricCredit(p){
    var f = p.fabric; if(!f) return '';
    return '<p class="fabric-credit">Textile photograph: ' +
      '<a href="'+esc(f.source_url)+'" rel="noopener nofollow">'+esc(f.title)+'</a>' +
      (f.creator ? ' by '+esc(f.creator) : '') + ', ' +
      '<a href="'+esc(f.license_url)+'" rel="noopener nofollow license">'+esc(f.license)+'</a></p>';
  }

  /* Dressing information, shown on the card rather than buried in a size guide. */
  function fitLine(p){
    var a = p.accessibility; if(!a) return '';
    var tags = [];
    if(a.pull_on) tags.push('Pulls on');
    if(a.seated_friendly) tags.push('Seated fit');
    if(a.tagless) tags.push('Tagless');
    if(a.closures && a.closures !== 'none') tags.push(a.closures.charAt(0).toUpperCase() + a.closures.slice(1));
    if(!tags.length) return '';
    return '<ul class="fit-list" aria-label="Dressing details">' +
      tags.map(function(t){ return '<li class="fit-pill">' + esc(t) + '</li>'; }).join('') + '</ul>';
  }

  /* A photograph when the record has one, otherwise the drawn catalogue plate. */
  function media(p){
    if(p.photo) return '<img src="'+esc(p.photo)+'" alt="'+esc(p.alt)+'" loading="lazy">';
    if(window.ZeraPlate) return window.ZeraPlate.render(p);
    return '<span class="sr-only">'+esc(p.alt)+'</span>';
  }

  var grid = document.getElementById('product-grid');
  var resultCount = document.getElementById('result-count');

  function renderGrid(){
    var filtered = getFiltered();
    var anyMatched = quizAnswers ? filtered.some(function(p){ return getMatches(p).length > 0; }) : true;
    var list = getSorted(filtered);
    grid.innerHTML = '';
    resultCount.textContent = list.length + (list.length === 1 ? ' piece' : ' pieces') + (quizAnswers && !anyMatched ? ' — closest matches shown' : '');

    if(list.length === 0){
      var li = document.createElement('li');
      li.style.gridColumn = '1 / -1';
      li.style.color = 'var(--slate)';
      li.textContent = 'No pieces match that size right now. Try clearing the size filter.';
      grid.appendChild(li);
      return;
    }

    list.forEach(function(p){
      var li = document.createElement('li');
      li.className = 'product-card';
      var matches = getMatches(p);
      var matchHtml = '';
      if(quizAnswers && matches.length){
        matchHtml = '<div class="match-list" aria-label="Matches your answers: ' + matches.join(', ') + '">' +
          matches.map(function(m){ return '<span class="match-pill">'+m+'</span>'; }).join('') +
          '</div>';
      } else if(quizAnswers){
        matchHtml = '<p class="match-note">Doesn\'t match your answers, shown as an alternative.</p>';
      }
      var labelHtml = '<span class="a-letter">A</span>dd to bag';
      li.innerHTML =
        '<div class="product-media">' +
          media(p) +
          '<span class="product-tag">'+esc(p.tag)+'</span>' +
          '<span class="product-swatch" aria-hidden="true" style="--sw:'+esc((p.colour&&p.colour.hex)||'#ccc')+'"></span>' +
        '</div>' +
        '<div class="product-info">' +
          '<h3 id="name-'+p.id+'">'+esc(p.name)+'</h3>' +
          '<p class="product-meta">Sizes '+p.size.join(', ')+'</p>' +
          '<p class="product-price">'+fmt(p.price)+'</p>' +
          sourceLine(p) +
          fabricCredit(p) +
          fitLine(p) +
          matchHtml +
          '<div class="product-actions">' +
            '<button type="button" class="btn-add" data-add="'+p.id+'">'+labelHtml+'</button>' +
            '<button type="button" class="btn-ghost" data-passport="'+p.id+'">Details<span class="sr-only"> and product passport for '+esc(p.name)+'</span></button>' +
            '<button type="button" class="btn-icon btn-speak" data-speak-product="'+p.id+'" aria-label="Read '+esc(p.name)+' aloud" title="Read aloud">' + speakIcon() + '</button>' +
          '</div>' +
        '</div>';
      grid.appendChild(li);
    });
    alignStoryToGrid();
  }

  grid.addEventListener('click', function(e){
    var add = e.target.closest('[data-add]');
    if(add){ openSizeModal(add.getAttribute('data-add'), add); return; }
    var pass = e.target.closest('[data-passport]');
    if(pass){ openPassport(pass.getAttribute('data-passport'), pass); return; }
    var speak = e.target.closest('[data-speak-product]');
    if(speak){
      var prod = byId(speak.getAttribute('data-speak-product'));
      if(prod) emit('speak', {text: describe(prod), source: speak});
    }
  });

  function byId(id){ return products.filter(function(p){ return p.id === id; })[0]; }

  /* One spoken sentence per piece — what it is, what it costs, how it fastens,
     where it came from. Read aloud by the Listen button and by the audio guide. */
  function describe(p){
    var out = [p.name + ', ' + fmt(p.price) + '.'];
    if(p.colour && p.colour.name) out.push('Colourway: ' + p.colour.name + '.');
    if(p.description) out.push(p.description);
    out.push('Available in sizes ' + p.size.join(', ') + '.');
    var a = p.accessibility;
    if(a){
      if(a.closures === 'none') out.push('It has no fastenings and pulls on.');
      else out.push('It fastens with ' + a.closures + '.');
      if(a.notes) out.push(a.notes);
    }
    var ch = p.sourcing && channelById[p.sourcing.channel];
    if(ch) out.push('Sourced via ' + ch.name + '.');
    if(p.sourcing && p.sourcing.condition) out.push('Condition: ' + p.sourcing.condition);
    var comp = p.passport && p.passport.composition;
    if(comp && comp.length){
      out.push('Made of ' + comp.map(function(c){ return c.percent + ' percent ' + c.fibre.toLowerCase(); }).join(', ') + '.');
    }
    var m = getMatches(p);
    if(quizAnswers && m.length) out.push('Matches your answers on ' + m.join(', ') + '.');
    return out.join(' ');
  }

  /* ---------- Product passport ---------- */
  var passportModal = document.getElementById('passport-modal');
  var passportOverlay = document.getElementById('passport-overlay');
  var passportBody = document.getElementById('passport-body');
  var passportTitle = document.getElementById('passport-title');
  var passportClose = document.getElementById('passport-close');
  var passportSpeak = document.getElementById('passport-speak');
  var lastFocusedBeforePassport = null;
  var passportProduct = null;

  function row(label, value){
    if(!value) return '';
    return '<div class="pp-row"><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function openPassport(id, triggerEl){
    var p = byId(id); if(!p) return;
    passportProduct = p;
    lastFocusedBeforePassport = triggerEl || document.activeElement;
    passportTitle.textContent = p.name;

    var ch = p.sourcing && channelById[p.sourcing.channel];
    var reg = p.sourcing && p.sourcing.regulation && regById[p.sourcing.regulation];
    var pp = p.passport || {};
    var a = p.accessibility || {};

    var comp = (pp.composition || []).map(function(c){
      return '<li><span class="pp-bar" style="--pct:' + c.percent + '%" aria-hidden="true"></span>' +
             esc(c.fibre) + ' <b>' + c.percent + '%</b></li>';
    }).join('');

    passportBody.innerHTML =
      '<p class="pp-lede">' + esc(p.description || '') + '</p>' +

      '<h3 class="pp-h">Dressing and fit</h3>' +
      '<dl class="pp-dl">' +
        row('Fastenings', esc(a.closures === 'none' ? 'None — pulls on' : (a.closures || ''))) +
        row('Seated fit', a.seated_friendly ? 'Yes' : 'Not specified') +
        row('Sewn-in tags', a.tagless ? 'None' : 'Present') +
        row('Notes', esc(a.notes || '')) +
      '</dl>' +

      '<h3 class="pp-h">Product passport</h3>' +
      '<p class="pp-note">Fields modelled on the EU Digital Product Passport for textiles. ' +
        '<a href="docs/data-sources.html">How this is sourced</a></p>' +
      (comp ? '<ul class="pp-comp">' + comp + '</ul>' : '') +
      '<dl class="pp-dl">' +
        row('Colourway', esc((p.colour && p.colour.name) || '')) +
        row('Textile photograph', p.fabric
          ? '<a href="'+esc(p.fabric.source_url)+'" rel="noopener nofollow">'+esc(p.fabric.title)+'</a>' +
            (p.fabric.creator ? ' by '+esc(p.fabric.creator) : '') +
            '<br><span class="pp-sub">'+esc(p.fabric.license)+' via '+esc(p.fabric.source)+' &middot; ' +
            '<a href="'+esc(p.fabric.license_url)+'" rel="noopener nofollow license">licence</a></span>'
          : '') +
        row('Origin', esc(pp.origin || '')) +
        row('Care', esc(pp.care || '')) +
        row('Recyclability', esc(pp.recyclability || '')) +
        row('Reuse cycle', pp.reuse_cycle ? esc(String(pp.reuse_cycle)) + (pp.reuse_cycle === 1 ? 'st life' : pp.reuse_cycle === 2 ? 'nd life' : 'rd life') : '') +
      '</dl>' +

      '<h3 class="pp-h">How it got here</h3>' +
      '<dl class="pp-dl">' +
        row('Channel', ch ? esc(ch.name) + ' <span class="source-cc">' + esc(ch.country) + '</span><br><span class="pp-sub">' + esc(ch.note || '') + '</span>' : 'Hand-sourced') +
        row('Provenance', esc((p.sourcing && p.sourcing.provenance) || '')) +
        row('Condition', esc((p.sourcing && p.sourcing.condition) || '')) +
        (reg ? row('EU rule in play', '<strong>' + esc(reg.short) + '</strong><br><span class="pp-sub">' + esc(reg.summary) + '</span>' +
          (reg.sources && reg.sources.length ? '<br><a href="' + esc(reg.sources[0]) + '" rel="noopener">Read the rule</a>' : '')) : '') +
      '</dl>';

    passportOverlay.classList.add('open');
    passportModal.hidden = false;
    passportClose.focus();
    document.addEventListener('keydown', onPassportKeydown);
  }

  function closePassport(){
    passportOverlay.classList.remove('open');
    passportModal.hidden = true;
    passportProduct = null;
    document.removeEventListener('keydown', onPassportKeydown);
    emit('speak-stop');
    if(lastFocusedBeforePassport) lastFocusedBeforePassport.focus();
  }

  function onPassportKeydown(e){
    if(e.key === 'Escape'){ closePassport(); return; }
    trapTab(e, passportModal);
  }

  function trapTab(e, container){
    if(e.key !== 'Tab') return;
    var focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var live = Array.prototype.filter.call(focusable, function(el){ return !el.disabled && el.offsetParent !== null; });
    if(!live.length) return;
    var first = live[0], last = live[live.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }

  passportClose.addEventListener('click', closePassport);
  passportOverlay.addEventListener('click', closePassport);
  passportSpeak.addEventListener('click', function(){
    if(!passportProduct) return;
    emit('speak', {text: describe(passportProduct) + ' ' + passportBody.textContent, source: passportSpeak});
  });

  /* ---------- Size picker modal ---------- */
  var pendingProductId = null;
  var lastFocusedBeforeSizeModal = null;
  var sizeOverlay = document.getElementById('size-overlay');
  var sizeModal = document.getElementById('size-modal');
  var sizeModalOptions = document.getElementById('size-modal-options');
  var sizeModalError = document.getElementById('size-modal-error');
  var sizeModalProduct = document.getElementById('size-modal-product');
  var sizeModalClose = document.getElementById('size-modal-close');
  var sizeModalConfirm = document.getElementById('size-modal-confirm');

  function openSizeModal(productId, triggerEl){
    var product = products.filter(function(p){ return p.id === productId; })[0];
    if(!product) return;
    pendingProductId = productId;
    lastFocusedBeforeSizeModal = triggerEl || document.activeElement;
    sizeModalProduct.textContent = product.name;
    sizeModalOptions.innerHTML = '';
    product.size.forEach(function(sz, i){
      var label = document.createElement('label');
      label.className = 'check-row';
      var inputId = 'size-choice-' + i;
      label.innerHTML = '<input type="radio" name="size-modal-choice" id="'+inputId+'" value="'+sz+'"><span>'+sz+'</span>';
      sizeModalOptions.appendChild(label);
    });
    sizeModalError.hidden = true;
    sizeOverlay.classList.add('open');
    sizeModal.hidden = false;
    var firstRadio = sizeModalOptions.querySelector('input');
    if(firstRadio) firstRadio.focus();
    document.addEventListener('keydown', onSizeModalKeydown);
  }

  function closeSizeModal(){
    sizeOverlay.classList.remove('open');
    sizeModal.hidden = true;
    document.removeEventListener('keydown', onSizeModalKeydown);
    if(lastFocusedBeforeSizeModal) lastFocusedBeforeSizeModal.focus();
  }

  function onSizeModalKeydown(e){
    if(e.key === 'Escape'){ closeSizeModal(); return; }
    if(e.key === 'Tab'){
      var focusable = sizeModal.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])');
      if(focusable.length === 0) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  sizeModalClose.addEventListener('click', closeSizeModal);
  sizeOverlay.addEventListener('click', closeSizeModal);

  sizeModalConfirm.addEventListener('click', function(){
    var selected = sizeModalOptions.querySelector('input[name="size-modal-choice"]:checked');
    if(!selected){
      sizeModalError.hidden = false;
      announce('Choose a size to continue.');
      emit('invalid');
      return;
    }
    sizeModalError.hidden = true;
    var size = selected.value;
    var product = products.filter(function(p){ return p.id === pendingProductId; })[0];
    var key = pendingProductId + '::' + size;
    cart[key] = cart[key] || {product:product, size:size, qty:0};
    cart[key].qty += 1;
    announce(product.name + ', size ' + size + ', added to your bag. Bag now has ' + cartCount() + (cartCount() === 1 ? ' item.' : ' items.'));
    emit('cart-add', {product: product, size: size});
    closeSizeModal();
    renderCart();
  });

  /* ---------- Bottoms sizing charts (shown during the quiz) ---------- */
  var mensBottomsSizes = [
    {size:'XXS', waist:'22.5\u201325.5', hip:'28.5\u201331.5'},
    {size:'XS', waist:'25.5\u201329', hip:'31.5\u201335'},
    {size:'S', waist:'29\u201332', hip:'35\u201337.5'},
    {size:'M', waist:'32\u201335', hip:'37.5\u201341'},
    {size:'L', waist:'35\u201338', hip:'41\u201344'},
    {size:'XL', waist:'38\u201343', hip:'44\u201347'},
    {size:'2XL', waist:'43\u201347.5', hip:'47\u201350.5'},
    {size:'3XL', waist:'47.5\u201352.5', hip:'50.5\u201353.5'},
    {size:'4XL', waist:'52.5\u201357', hip:'53.5\u201358.5'}
  ];
  var womensBottomsSizes = [
    {size:'XXS', waist:'21.25\u201323.5', hip:'30.5\u201333'},
    {size:'XS', waist:'23.5\u201326', hip:'33\u201335.5'},
    {size:'S', waist:'26\u201329', hip:'35.5\u201338.5'},
    {size:'M', waist:'29\u201331.5', hip:'38.5\u201341'},
    {size:'L', waist:'31.5\u201334.5', hip:'41\u201344'},
    {size:'XL', waist:'34.5\u201338.5', hip:'44\u201347'},
    {size:'2XL', waist:'38.5\u201342.5', hip:'47\u201350'},
    {size:'1X', waist:'41\u201345', hip:'46\u201350'},
    {size:'2X', waist:'45\u201349', hip:'50\u201354'},
    {size:'3X', waist:'49\u201353', hip:'54\u201358'}
  ];

  var lastFocusedBeforeBottomsModal = null;
  var bottomsOverlay = document.getElementById('bottoms-overlay');
  var bottomsModal = document.getElementById('bottoms-size-modal');
  var bottomsTitle = document.getElementById('bottoms-size-title');
  var bottomsTbody = document.getElementById('bottoms-size-tbody');
  var bottomsClose = document.getElementById('bottoms-size-close');

  function openBottomsSizeModal(kind){
    var data = kind === 'mens' ? mensBottomsSizes : womensBottomsSizes;
    bottomsTitle.textContent = (kind === 'mens' ? "Men's" : "Women's") + ' bottoms sizing';
    bottomsTbody.innerHTML = '';
    data.forEach(function(row){
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="padding:0.55rem 0.75rem;border-bottom:1px solid var(--line);">'+row.size+'</td>' +
        '<td style="padding:0.55rem 0.75rem;border-bottom:1px solid var(--line);">'+row.waist+'</td>' +
        '<td style="padding:0.55rem 0.75rem;border-bottom:1px solid var(--line);">'+row.hip+'</td>';
      bottomsTbody.appendChild(tr);
    });
    lastFocusedBeforeBottomsModal = document.activeElement;
    bottomsOverlay.classList.add('open');
    bottomsModal.hidden = false;
    bottomsClose.focus();
    document.addEventListener('keydown', onBottomsModalKeydown);
  }

  function closeBottomsSizeModal(){
    bottomsOverlay.classList.remove('open');
    bottomsModal.hidden = true;
    document.removeEventListener('keydown', onBottomsModalKeydown);
    if(lastFocusedBeforeBottomsModal) lastFocusedBeforeBottomsModal.focus();
  }

  function onBottomsModalKeydown(e){
    if(e.key === 'Escape'){ closeBottomsSizeModal(); return; }
    if(e.key === 'Tab'){
      var focusable = bottomsModal.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      if(focusable.length === 0) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  document.getElementById('mens-bottoms-btn').addEventListener('click', function(){ openBottomsSizeModal('mens'); });
  document.getElementById('womens-bottoms-btn').addEventListener('click', function(){ openBottomsSizeModal('womens'); });
  bottomsClose.addEventListener('click', closeBottomsSizeModal);
  bottomsOverlay.addEventListener('click', closeBottomsSizeModal);

  document.getElementById('clear-filters').addEventListener('click', function(){
    sizeFilters = [];
    fitFilters = [];
    channelFilter = '';
    document.querySelectorAll('[data-filter="size"], [data-filter="fit"]').forEach(function(cb){ cb.checked = false; });
    if(channelSelect) channelSelect.value = '';
    renderGrid();
    announce('All filters cleared.');
  });

  document.querySelectorAll('[data-filter="size"]').forEach(function(cb){
    cb.addEventListener('change', function(){
      if(cb.checked){ if(sizeFilters.indexOf(cb.value) === -1) sizeFilters.push(cb.value); }
      else { sizeFilters = sizeFilters.filter(function(v){ return v !== cb.value; }); }
      renderGrid();
    });
  });

  document.querySelectorAll('[data-filter="fit"]').forEach(function(cb){
    cb.addEventListener('change', function(){
      if(cb.checked){ if(fitFilters.indexOf(cb.value) === -1) fitFilters.push(cb.value); }
      else { fitFilters = fitFilters.filter(function(v){ return v !== cb.value; }); }
      renderGrid();
      announce(document.getElementById('result-count').textContent + ' after filtering.');
    });
  });

  var channelSelect = document.getElementById('channel-filter');
  if(channelSelect){
    channelSelect.addEventListener('change', function(){
      channelFilter = channelSelect.value;
      renderGrid();
      announce(document.getElementById('result-count').textContent + ' from this channel.');
    });
  }

  document.getElementById('sort').addEventListener('change', function(e){
    sortMode = e.target.value;
    renderGrid();
  });

  /* ============ Cart ============ */
  function cartCount(){
    return Object.keys(cart).reduce(function(sum, id){ return sum + cart[id].qty; }, 0);
  }
  function cartTotal(){
    return Object.keys(cart).reduce(function(sum, id){ return sum + cart[id].qty * cart[id].product.price; }, 0);
  }

  var cartCountEl = document.getElementById('cart-count');
  var cartCountSr = document.getElementById('cart-count-sr');
  var cartBody = document.getElementById('cart-body');
  var cartSubtotal = document.getElementById('cart-subtotal');

  function renderCart(){
    var count = cartCount();
    cartCountEl.textContent = count;
    cartCountSr.textContent = count + (count === 1 ? ' item in your bag' : ' items in your bag');
    cartSubtotal.textContent = fmt(cartTotal());

    var ids = Object.keys(cart);
    if(ids.length === 0){
      cartBody.innerHTML = '<p class="cart-empty">Your bag is empty. Add a piece from the collection to get started.</p>';
      return;
    }
    cartBody.innerHTML = '';
    ids.forEach(function(id){
      var entry = cart[id];
      var row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML =
        '<div class="cart-thumb" aria-hidden="true">' + media(entry.product) + '</div>' +
        '<div class="cart-item-info">' +
          '<h3>'+entry.product.name+'</h3>' +
          '<p class="product-meta">Size '+entry.size+' &middot; '+fmt(entry.product.price)+'</p>' +
          '<div class="qty-row">' +
            '<button type="button" class="qty-btn" data-qty-down="'+id+'" aria-label="Decrease quantity of '+entry.product.name+', size '+entry.size+'">−</button>' +
            '<span aria-live="off">'+entry.qty+'</span>' +
            '<button type="button" class="qty-btn" data-qty-up="'+id+'" aria-label="Increase quantity of '+entry.product.name+', size '+entry.size+'">+</button>' +
          '</div>' +
          '<button type="button" class="remove-btn" data-remove="'+id+'">Remove</button>' +
        '</div>';
      cartBody.appendChild(row);
    });
  }

  cartBody.addEventListener('click', function(e){
    var up = e.target.closest('[data-qty-up]');
    var down = e.target.closest('[data-qty-down]');
    var remove = e.target.closest('[data-remove]');
    if(up){
      var id1 = up.getAttribute('data-qty-up');
      cart[id1].qty += 1;
      renderCart(); renderGrid();
    } else if(down){
      var id2 = down.getAttribute('data-qty-down');
      cart[id2].qty -= 1;
      if(cart[id2].qty <= 0){
        var name = cart[id2].product.name;
        delete cart[id2];
        announce(name + ' removed from your bag.');
      }
      renderCart(); renderGrid();
    } else if(remove){
      var id3 = remove.getAttribute('data-remove');
      var name2 = cart[id3].product.name;
      delete cart[id3];
      announce(name2 + ' removed from your bag.');
      renderCart(); renderGrid();
    }
  });

  document.getElementById('checkout-btn').addEventListener('click', function(){
    if(cartCount() === 0){
      announce('Your bag is empty. Add a piece before checking out.');
      return;
    }
    announce('Checkout is not connected in this preview.');
  });

  /* ============ Drawer open/close with focus trap ============ */
  var overlay = document.getElementById('overlay');
  var drawer = document.getElementById('cart-drawer');
  var openBtn = document.getElementById('cart-open-btn');
  var closeBtn = document.getElementById('cart-close-btn');

  function openCart(){
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    drawer.classList.add('open');
    closeBtn.focus();
    document.addEventListener('keydown', onDrawerKeydown);
  }
  function closeCart(){
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    document.removeEventListener('keydown', onDrawerKeydown);
    if(lastFocused) lastFocused.focus();
  }
  function onDrawerKeydown(e){
    if(e.key === 'Escape'){ closeCart(); return; }
    if(e.key === 'Tab'){
      var focusable = drawer.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      if(focusable.length === 0) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }
  openBtn.addEventListener('click', openCart);
  closeBtn.addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);

  /* ============ Accessibility ============ */
  /* All preference handling lives in assets/a11y.js so it can be reasoned about
     (and tested) on its own. This file only needs to relayout when text metrics change. */
  var root = document.documentElement;
  document.addEventListener('zera:layout-changed', function(){
    window.setTimeout(alignStoryToGrid, 50);
  });

  /* The story section is laid out in CSS now; nothing to reposition here. */
  function alignStoryToGrid(){}


  /* ============ Boot: load the JSON database, then start ============ */
  function populateChannelFilter(){
    if(!channelSelect) return;
    var used = {};
    products.forEach(function(p){ if(p.sourcing && p.sourcing.channel) used[p.sourcing.channel] = true; });
    sources.channels.filter(function(c){ return used[c.id]; }).forEach(function(c){
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + ' (' + c.country + ')';
      channelSelect.appendChild(opt);
    });
  }

  function renderSourcingNote(){
    var el = document.getElementById('sourcing-note');
    if(!el) return;
    var live = sources.regulations.filter(function(r){ return r.in_application_since || r.in_force_since; });
    el.innerHTML = '<p>Stock is routed from <strong>' + sources.channels.length + '</strong> researched EU reuse channels, ' +
      'opened up by <strong>' + live.length + '</strong> pieces of EU law now in force. ' +
      '<a href="docs/data-sources.html">See the sourcing database</a>.</p>';
  }

  function bootFailed(err){
    var main = document.getElementById('main');
    main.insertAdjacentHTML('afterbegin',
      '<div class="boot-error" role="alert">' +
      '<h2>The catalogue could not load</h2>' +
      '<p>This prototype reads its inventory from <code>data/inventory.json</code>, which a browser will not fetch from a <code>file://</code> path. ' +
      'Serve the folder over HTTP and reload:</p>' +
      '<pre><code>python3 -m http.server 8000</code></pre>' +
      '<p>Then open <code>http://localhost:8000</code>. On GitHub Pages this works with no setup.</p>' +
      '<p class="pp-sub">' + esc(String(err && err.message ? err.message : err)) + '</p></div>');
    document.getElementById('quiz-section').hidden = true;
  }

  function boot(){
    return Promise.all([
      fetch('data/inventory.json').then(function(r){ if(!r.ok) throw new Error('inventory.json: HTTP ' + r.status); return r.json(); }),
      fetch('data/sources.json').then(function(r){ if(!r.ok) throw new Error('sources.json: HTTP ' + r.status); return r.json(); })
    ]).then(function(res){
      products = res[0].items || [];
      sources = res[1] || sources;
      (sources.channels || []).forEach(function(c){ channelById[c.id] = c; });
      (sources.regulations || []).forEach(function(r){ regById[r.id] = r; });
      populateChannelFilter();
      renderSourcingNote();
      showStep(0, false);
      renderCart();
      alignStoryToGrid();
      emit('ready', {count: products.length});
    }).catch(bootFailed);
  }

  window.ZERA = {
    describe: describe,
    products: function(){ return products; },
    sources: function(){ return sources; },
    announce: announce
  };

  boot();

  /* ============ Fade-in on scroll for the green section ============ */
  var fadeItems = document.querySelectorAll('.fade-item');
  if(fadeItems.length){
    if('IntersectionObserver' in window){
      var fadeObserver = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add('fade-in');
            fadeObserver.unobserve(entry.target);
          }
        });
      }, {threshold: 0.2});
      fadeItems.forEach(function(el){ fadeObserver.observe(el); });
    } else {
      fadeItems.forEach(function(el){ el.classList.add('fade-in'); });
    }
  }
})();
