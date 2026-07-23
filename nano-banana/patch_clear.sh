#!/bin/bash
sed -i 's/onOpenEntities={() => setActiveModal('"'"'entityReview'"'"')}/onOpenEntities={() => setActiveModal('"'"'entityReview'"'"')}\n        onClearData={handleClearData}/' src/App.tsx
