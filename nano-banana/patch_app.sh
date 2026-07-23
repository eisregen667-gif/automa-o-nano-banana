#!/bin/bash
cat << 'INNER_EOF' > patch_app.patch
--- src/App.tsx
+++ src/App.tsx
@@ -542,6 +542,13 @@
     }
   };
 
+  const handleHardReset = async () => {
+    if (confirm('Atenção: Isso forçará a limpeza de todo o banco de dados e recarregará a página. Continuar?')) {
+      await clearDb();
+      window.location.reload();
+    }
+  };
+
   return (
     <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
       <Header
@@ -555,6 +562,7 @@
         onOpenPromptMatrix={() => setActiveModal('promptMatrix')}
         onOpenEntities={() => setActiveModal('entityReview')}
         onClearData={handleClearData}
+        onHardReset={handleHardReset}
         hasPrompts={frames.length > 0}
         hasEntities={!!entityRegistry && entityRegistry.entities.length > 0}
       />
INNER_EOF
patch src/App.tsx < patch_app.patch
