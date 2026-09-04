/* =============================================================================
   Inclusively Zera — catalogue plates
   -----------------------------------------------------------------------------
   Draws a catalogue plate for a garment: the silhouette comes from the item's
   own record, and it is filled with a photograph of the real textile.

   Why it is built this way:
   - whole-garment photography without models does not exist at catalogue scale
     under an open licence, and repeating one stock photo across unrelated
     one-of-one pieces would misrepresent them
   - the fabric photographs are real and openly licensed (CC BY / BY-SA / CC0),
     credited per item from the `fabric` block in data/inventory.json
   - the plate is SVG, so it scales with the text-size preference instead of
     blurring, and its ink and ground follow the light, dark and contrast themes
   - `photo` on an item overrides all of this with a straight photograph

   Public API:  window.ZeraPlate.render(item) -> SVG markup string
   ============================================================================= */
(function () {
  'use strict';

  var W = 300, H = 400;

  /* ---------------------------------------------------------------------------
     Silhouettes. Each returns { body, detail } where `body` is the fillable
     outline and `detail` is the linework drawn on top of it.
     --------------------------------------------------------------------------- */
  var SILHOUETTES = {
    tank: function () {
      return {
        hem: 252,
        body: 'M106 96 L106 74 Q106 62 118 60 L130 58 Q150 76 170 58 L182 60 Q194 62 194 74 L194 96 ' +
              'L198 252 Q150 262 102 252 Z',
        detail: 'M130 58 Q150 76 170 58 M106 96 L194 96'
      };
    },
    tee: function () {
      return {
        hem: 262,
        body: 'M112 92 L74 118 L56 96 L104 58 Q126 50 150 50 Q174 50 196 58 L244 96 L226 118 L188 92 ' +
              'L192 262 Q150 272 108 262 Z',
        detail: 'M124 54 Q150 76 176 54 M112 92 L188 92'
      };
    },
    blouse: function () {
      return {
        hem: 274,
        body: 'M112 92 L78 128 L60 106 L104 58 Q126 50 150 50 Q174 50 196 58 L240 106 L222 128 L188 92 ' +
              'L192 274 Q150 282 108 274 Z',
        detail: 'M124 54 L150 84 L176 54 M150 84 L150 274 M112 92 L120 266 M188 92 L180 266'
      };
    },
    jacket: function () {
      return {
        hem: 314,
        body: 'M108 96 L70 124 L52 100 L100 60 Q126 50 150 52 Q174 50 200 60 L248 100 L230 124 L192 96 ' +
              'L196 314 Q150 322 104 314 Z',
        detail: 'M150 62 L150 314 M118 62 L150 88 L182 62 M108 96 L112 306 M192 96 L188 306'
      };
    },
    coat: function () {
      return {
        hem: 348,
        body: 'M106 98 L66 130 L46 104 L98 60 Q126 48 150 50 Q174 48 202 60 L254 104 L234 130 L194 98 ' +
              'L200 348 Q150 358 100 348 Z',
        detail: 'M150 64 L150 348 M114 60 L150 92 L186 60 M106 98 L110 340 M194 98 L190 340 ' +
                'M150 300 L150 348'
      };
    },
    dress: function () {
      return {
        hem: 352,
        body: 'M110 92 L76 120 L58 98 L104 58 Q126 50 150 50 Q174 50 196 58 L242 98 L224 120 L190 92 ' +
              'L184 186 L214 352 Q150 366 86 352 L116 186 Z',
        detail: 'M124 54 Q150 78 176 54 M116 186 L184 186 M110 92 L116 186 M190 92 L184 186'
      };
    },
    trouser: function () {
      return {
        hem: 350,
        body: 'M96 74 L204 74 L214 350 L162 350 L150 190 L138 350 L86 350 Z',
        detail: 'M96 96 L204 96 M150 96 L150 190 M96 74 L204 74'
      };
    },
    legging: function () {
      return {
        hem: 352,
        body: 'M104 74 L196 74 L204 352 L160 352 L150 200 L140 352 L96 352 Z',
        detail: 'M104 100 L196 100 M150 100 L150 200'
      };
    },
    shorts: function () {
      return {
        hem: 236,
        body: 'M94 74 L206 74 L214 236 L160 236 L150 168 L140 236 L86 236 Z',
        detail: 'M94 98 L206 98 M150 98 L150 168'
      };
    },
    set: function () {
      return {
        hem: 356,
        body: 'M108 66 L108 52 Q108 44 118 42 L130 40 Q150 56 170 40 L182 42 Q192 44 192 52 L192 66 ' +
              'L196 186 Q150 196 104 186 Z ' +
              'M100 226 L200 226 L208 356 L160 356 L150 268 L140 356 L92 356 Z',
        detail: 'M130 40 Q150 56 170 40 M100 248 L200 248'
      };
    }
  };

  /* ---------------------------------------------------------------------------
     Surfaces. Each returns a <pattern> definition, referenced by the body fill.
     --------------------------------------------------------------------------- */
  var TEXTURES = {
    plain: function () { return ''; },

    sequin: function (id) {
      return '<pattern id="' + id + '" width="9" height="9" patternUnits="userSpaceOnUse">' +
        '<circle cx="4.5" cy="4.5" r="1.7" fill="var(--plate-ink)" opacity="0.34"/>' +
        '<circle cx="0" cy="0" r="1.7" fill="var(--plate-ink)" opacity="0.18"/>' +
        '<circle cx="9" cy="9" r="1.7" fill="var(--plate-ink)" opacity="0.18"/></pattern>';
    },

    fringe: function (id) {
      return '<pattern id="' + id + '" width="7" height="14" patternUnits="userSpaceOnUse">' +
        '<path d="M3.5 0 V14" stroke="var(--plate-ink)" stroke-width="1" opacity="0.3"/></pattern>';
    },

    mesh: function (id) {
      return '<pattern id="' + id + '" width="10" height="10" patternUnits="userSpaceOnUse">' +
        '<path d="M0 0 L10 10 M10 0 L0 10" stroke="var(--plate-ink)" stroke-width="0.8" opacity="0.3"/></pattern>';
    },

    crochet: function (id) {
      return '<pattern id="' + id + '" width="14" height="14" patternUnits="userSpaceOnUse">' +
        '<circle cx="7" cy="7" r="4" fill="none" stroke="var(--plate-ink)" stroke-width="1" opacity="0.32"/>' +
        '<circle cx="0" cy="0" r="4" fill="none" stroke="var(--plate-ink)" stroke-width="1" opacity="0.32"/>' +
        '<circle cx="14" cy="14" r="4" fill="none" stroke="var(--plate-ink)" stroke-width="1" opacity="0.32"/></pattern>';
    },

    tweed: function (id) {
      return '<pattern id="' + id + '" width="8" height="8" patternUnits="userSpaceOnUse">' +
        '<path d="M0 8 L8 0" stroke="var(--plate-ink)" stroke-width="1.4" opacity="0.26"/>' +
        '<path d="M-2 2 L2 -2 M6 10 L10 6" stroke="var(--plate-ink)" stroke-width="1.4" opacity="0.26"/></pattern>';
    },

    panel: function (id) {
      return '<pattern id="' + id + '" width="22" height="22" patternUnits="userSpaceOnUse">' +
        '<path d="M0 0 V22" stroke="var(--plate-ink)" stroke-width="1.2" opacity="0.34"/></pattern>';
    },

    patch: function (id) {
      return '<pattern id="' + id + '" width="26" height="26" patternUnits="userSpaceOnUse">' +
        '<path d="M0 0 H26 V26 H0 Z" fill="none" stroke="var(--plate-ink)" stroke-width="1" opacity="0.24"/>' +
        '<path d="M0 13 H26" stroke="var(--plate-ink)" stroke-width="0.8" opacity="0.16" stroke-dasharray="3 3"/></pattern>';
    },

    print: function (id) {
      return '<pattern id="' + id + '" width="18" height="18" patternUnits="userSpaceOnUse">' +
        '<path d="M9 3 L15 15 H3 Z" fill="none" stroke="var(--plate-ink)" stroke-width="1.1" opacity="0.28"/></pattern>';
    },

    button: function (id) {
      return '<pattern id="' + id + '" width="1" height="1" patternUnits="userSpaceOnUse"></pattern>';
    }
  };

  /* Buttons are placed on the placket rather than tiled across the garment. */
  function buttonRow(item, shape) {
    var closures = (item.accessibility && item.accessibility.closures) || '';
    if (!/button/i.test(closures)) return '';
    var top = 104;
    var span = (shape.hem || 300) - 34 - top;
    var out = '';
    for (var i = 0; i < 4; i++) {
      out += '<circle cx="150" cy="' + (top + (span / 3) * i) + '" r="4.4" ' +
             'fill="var(--plate-ground)" stroke="var(--plate-ink)" stroke-width="1.4"/>';
    }
    return out;
  }

  /* A zip drawn where the record says there is one. */
  function zip(item, shape) {
    var closures = (item.accessibility && item.accessibility.closures) || '';
    if (!/zip/i.test(closures)) return '';
    var side = /side/i.test(closures);
    var x = side ? 102 : 150;
    var y1 = side ? 80 : 96;
    var y2 = (shape.hem || 300) - 8;
    return '<path d="M' + x + ' ' + y1 + ' V' + y2 + '" stroke="var(--plate-ink)" stroke-width="1.2" ' +
           'stroke-dasharray="3 3" opacity="0.65"/>' +
           '<circle cx="' + x + '" cy="' + (y2 - 14) + '" r="5" fill="none" ' +
           'stroke="var(--plate-ink)" stroke-width="1.4"/>';
  }

  /* Fringe hangs off the hem instead of filling the body. */
  function fringeHem(item, shape) {
    var emb = item.embellishments || [];
    if (emb.indexOf('fringe') === -1) return '';
    var y = shape.hem || 300;
    var out = '';
    for (var x = 100; x <= 202; x += 6) {
      out += '<path d="M' + x + ' ' + y + ' v' + (18 + (x % 12)) + '" ' +
             'stroke="var(--plate-ink)" stroke-width="1.1" opacity="0.5"/>';
    }
    return out;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------------------
     render
     --------------------------------------------------------------------------- */
  function render(item) {
    var spec = (item.plate || {});
    var shape = (SILHOUETTES[spec.silhouette] || SILHOUETTES.tee)();
    var texName = TEXTURES[spec.texture] ? spec.texture : 'plain';
    var uid = 'pl-' + item.id;
    var patternId = uid + '-tex';
    var tex = TEXTURES[texName](patternId);
    var colour = (item.colour && item.colour.hex) || '#CFC4B4';

    var fabric = item.fabric && item.fabric.file;
    var clipId = uid + '-clip';

    return '' +
      '<svg class="plate" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
        'aria-label="' + esc(item.alt) + '" style="--plate-colour:' + esc(colour) + '">' +
        '<defs>' +
          tex +
          '<clipPath id="' + clipId + '"><path d="' + shape.body + '"/></clipPath>' +
          /* Duotone: strip the photograph's own hue, then compress it into the
             upper range so a dark colourway still shows the weave once the
             greyscale is multiplied over the flat colour beneath it. */
          '<filter id="' + uid + '-grey" color-interpolation-filters="sRGB">' +
            '<feColorMatrix type="saturate" values="0"/>' +
            '<feComponentTransfer>' +
              '<feFuncR type="linear" slope="0.46" intercept="0.54"/>' +
              '<feFuncG type="linear" slope="0.46" intercept="0.54"/>' +
              '<feFuncB type="linear" slope="0.46" intercept="0.54"/>' +
            '</feComponentTransfer>' +
          '</filter>' +
          /* A second, darkened copy of the same greyscale. Screened back over
             the multiply it returns the weave's highlights, which a dark
             colourway would otherwise swallow. */
          '<filter id="' + uid + '-lift" color-interpolation-filters="sRGB">' +
            '<feColorMatrix type="saturate" values="0"/>' +
            '<feComponentTransfer>' +
              '<feFuncR type="gamma" amplitude="1" exponent="3.4" offset="0"/>' +
              '<feFuncG type="gamma" amplitude="1" exponent="3.4" offset="0"/>' +
              '<feFuncB type="gamma" amplitude="1" exponent="3.4" offset="0"/>' +
            '</feComponentTransfer>' +
          '</filter>' +
          /* A soft vertical fall so the flat does not read as a sticker. */
          '<linearGradient id="' + uid + '-fall" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#fff" stop-opacity="0.16"/>' +
            '<stop offset="1" stop-color="#000" stop-opacity="0.1"/>' +
          '</linearGradient>' +
        '</defs>' +

        /* Registration marks, the way a pattern sheet is cornered. */
        '<g class="plate-marks" stroke="var(--plate-rule)" stroke-width="1" fill="none">' +
          '<path d="M14 14 h18 M14 14 v18"/>' +
          '<path d="M286 14 h-18 M286 14 v18"/>' +
          '<path d="M14 386 h18 M14 386 v-18"/>' +
          '<path d="M286 386 h-18 M286 386 v-18"/>' +
        '</g>' +

        '<g class="plate-garment">' +
          fringeHem(item, shape) +
          (fabric ? '' : '<path d="' + shape.body + '" fill="var(--plate-colour)"/>') +
          (fabric
            /* Real cloth, clipped to the silhouette and multiplied over the
               colourway. preserveAspectRatio slices rather than squashes, so
               the weave keeps its true proportions. */
            /* The colourway and the photograph share one clipped group so the
               multiply blends against the colour rather than the page. */
            ? '<g clip-path="url(#' + clipId + ')" style="isolation:isolate">' +
                '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--plate-colour)"/>' +
                '<image href="' + esc(fabric) + '" x="0" y="0" width="' + W + '" height="' + H + '" ' +
                  'preserveAspectRatio="xMidYMid slice" filter="url(#' + uid + '-grey)" ' +
                  'style="mix-blend-mode:multiply"/>' +
                '<image href="' + esc(fabric) + '" x="0" y="0" width="' + W + '" height="' + H + '" ' +
                  'preserveAspectRatio="xMidYMid slice" filter="url(#' + uid + '-lift)" ' +
                  'opacity="0.34" style="mix-blend-mode:screen"/>' +
              '</g>'
            : (texName !== 'plain'
                ? '<path d="' + shape.body + '" fill="url(#' + patternId + ')"/>'
                : '')) +
          '<path d="' + shape.body + '" fill="url(#' + uid + '-fall)"/>' +
          '<path d="' + shape.body + '" fill="none" stroke="var(--plate-ink)" ' +
            'stroke-width="1.8" stroke-linejoin="round"/>' +
          '<path d="' + shape.detail + '" fill="none" stroke="var(--plate-ink)" ' +
            'stroke-width="1.2" opacity="0.7" stroke-linecap="round"/>' +
          zip(item, shape) +
          buttonRow(item, shape) +
        '</g>' +
      '</svg>';
  }

  window.ZeraPlate = { render: render, silhouettes: Object.keys(SILHOUETTES), textures: Object.keys(TEXTURES) };
})();
