const fs = require('fs');
const file = 'c:/Jouhayerk/git/app/public/phomemo-designer/index.html';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '/* Fix specific inputs like color pickers or canvas */',
    \.toolbar-btn svg { width: 20px !important; height: 20px !important; }
          .toolbar-btn span { font-size: 11px !important; line-height: 14px !important; }
          .toolbar-btn { padding: 6px 10px !important; gap: 4px !important; }
          /* Fix specific inputs like color pickers or canvas */\
);

content = content.replace(
    '#label-canvas {',
    \.toolbar-btn svg { width: 20px !important; height: 20px !important; }
          .toolbar-btn span { font-size: 11px !important; line-height: 14px !important; }
          .toolbar-btn { padding: 6px 10px !important; gap: 4px !important; }
          #label-canvas {\
);

fs.writeFileSync(file, content);
console.log('Added larger buttons CSS');
