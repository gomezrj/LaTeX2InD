#target indesign
#targetengine "LaTeX2InDUnified"

/* LaTeX2InD — unified ExtendScript edition. InDesign 18+ (2023).
 * PDFs: equations/*.pdf; editable records: equations/auxiliary/record-<id>/.
 * Deliberately ES3-compatible. Core is host-independent for regression tests.
 */
var LaTeX2InDCore = (function () {
    var C = {};
    C.trim = function (s) { return String(s).replace(/^\s+|\s+$/g, ""); };
    C.parentPath = function (s) {
        // ExtendScript's regex parser differs from modern JavaScript around
        // slash characters in character classes. Use literal path operations.
        s = String(s);
        return s.substring(0, Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")));
    };
    C.sh = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
    C.ps = function (s) { return "'" + String(s).replace(/'/g, "''") + "'"; };
    C.apple = function (s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"'; };
    C.xml = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    C.unxml = function (s) { return s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"); };
    C.fields = ["version", "id", "source", "mode", "size", "engine", "width", "height", "depth", "padding"];
    C.serialize = function (r) {
        var s = '<?xml version="1.0" encoding="UTF-8"?>\n<equation>\n', i, key;
        for (i = 0; i < C.fields.length; i++) {
            key = C.fields[i];
            s += "  <" + key + ">" + C.xml(r[key] === undefined ? "" : r[key]) + "</" + key + ">\n";
        }
        return s + "</equation>\n";
    };
    C.parse = function (s) {
        var r = {}, i, key, m;
        for (i = 0; i < C.fields.length; i++) {
            key = C.fields[i]; m = s.match(new RegExp("<" + key + ">([\\s\\S]*?)</" + key + ">"));
            if (!m) { throw Error("Incomplete equation record: " + key); }
            r[key] = C.unxml(m[1]);
        }
        if (r.version !== "1") { throw Error("Unsupported equation record version."); }
        return r;
    };
    C.safeName = function (s) {
        s = C.trim(s).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").substr(0, 64);
        if (!s) { s = "equation"; }
        if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(s)) { s = "equation_" + s; }
        return s;
    };
    C.independentName = function (s) {
        s = C.trim(s);
        if (!s) { throw Error("Enter a name in Make independent to first."); }
        if (C.safeName(s) !== s) {
            throw Error("Use up to 64 letters (A–Z), numbers, hyphens or underscores for the new name. Suggested name: " + C.safeName(s));
        }
        return s;
    };
    C.size = function (s) {
        var n = Number(s);
        if (!isFinite(n) || n < 1 || n > 300) { throw Error("Font size must be between 1 and 300 points."); }
        return n;
    };
    C.tex = function (r, macros) {
        var size = C.size(r.size), source = r.source;
        if (!C.trim(source)) { throw Error("Enter an equation first."); }
        if (r.mode !== "raw" && (/^\s*(\$|\\\[|\\\()/.test(source))) {
            throw Error("In Inline/Display math mode, enter the formula without enclosing math delimiters. Use LaTeX block for existing delimited code.");
        }
        var s = "\\RequirePackage{fix-cm}\n\\documentclass[border=0.5bp]{standalone}\n" +
            "\\usepackage{amsmath,amssymb,amsfonts,varwidth}\n" +
            (macros ? "\\input{macros.tex}\n" : "") +
            "\\newsavebox{\\LTIbox}\n\\newwrite\\LTImetrics\n\\begin{document}\n" +
            "\\fontsize{" + size + "bp}{" + (size * 1.2) + "bp}\\selectfont\n";
        // standalone collects horizontal material: wrapper newlines must not
        // become spaces around the measured box. Preserve user source verbatim.
        s = s.replace(/\n/g, "%\n");
        if (r.mode === "raw") {
            s += "\\begin{lrbox}{\\LTIbox}\\begin{varwidth}{16000bp}%\n" + source + "\n\\end{varwidth}\\end{lrbox}%\n";
        } else {
            s += "\\sbox{\\LTIbox}{$" + (r.mode === "display" ? "\\displaystyle " : "\\textstyle ") + source + "\n$}%\n";
        }
        return s + ("\\immediate\\openout\\LTImetrics=equation.metrics\n" +
            "\\immediate\\write\\LTImetrics{\\the\\wd\\LTIbox}\n" +
            "\\immediate\\write\\LTImetrics{\\the\\ht\\LTIbox}\n" +
            "\\immediate\\write\\LTImetrics{\\the\\dp\\LTIbox}\n" +
            "\\immediate\\closeout\\LTImetrics\n\\usebox{\\LTIbox}\n\\end{document}\n").replace(/\n/g, "%\n");
    };
    C.metrics = function (s) {
        var lines = C.trim(s).split(/\r?\n/), result = {}, keys = ["width", "height", "depth"], i, n;
        if (lines.length !== 3) { throw Error("LaTeX did not return valid baseline measurements."); }
        for (i = 0; i < 3; i++) {
            if (!/^\d+(\.\d+)?pt$/.test(C.trim(lines[i]))) { throw Error("Invalid equation measurement."); }
            n = parseFloat(lines[i]) * 72 / 72.27; // TeX pt -> PDF/InDesign pt
            result[keys[i]] = n;
        }
        if (result.width <= 0 || result.height + result.depth <= 0) { throw Error("The equation has no visible dimensions."); }
        result.padding = 0.5;
        return result;
    };
    C.macRunner = function (directory, executable, inputs) {
        return "#!/bin/sh\ncd " + C.sh(directory) + " || exit 1\n" +
            "export PATH=" + C.sh(C.parentPath(executable)) + ':"$PATH"\n' +
            (inputs ? "export TEXINPUTS=" + C.sh(".:" + inputs.join(":") + ":") + '\"${TEXINPUTS:-}\"\n' : "") +
            C.sh(executable) + " -interaction=nonstopmode -halt-on-error -file-line-error -no-shell-escape equation.tex > console.txt 2>&1\n" +
            "result=$?\nprintf '%s' \"$result\" > status.tmp\nmv status.tmp status.txt\n";
    };
    C.windowsRunner = function (directory, executable, inputs) {
        return "$ErrorActionPreference = 'Stop'\n$code = 1\ntry {\n" +
            "Set-Location -LiteralPath " + C.ps(directory) + "\n" +
            "$env:PATH = " + C.ps(C.parentPath(executable)) + " + ';' + $env:PATH\n" +
            (inputs ? "$env:TEXINPUTS = " + C.ps(".;" + inputs.join(";") + ";") + " + $env:TEXINPUTS\n" : "") +
            "& " + C.ps(executable) + " '-interaction=nonstopmode' '-halt-on-error' '-file-line-error' '-no-shell-escape' 'equation.tex' > 'console.txt' 2>&1\n" +
            "$code = $LASTEXITCODE\n} catch { $_ | Out-File -LiteralPath " + C.ps(directory + "\\console.txt") + " -Encoding utf8 }\n" +
            "[IO.File]::WriteAllText(" + C.ps(directory + "\\status.tmp") + ", [string]$code)\n" +
            "Move-Item -LiteralPath " + C.ps(directory + "\\status.tmp") + " -Destination " + C.ps(directory + "\\status.txt") + " -Force\n";
    };
    C.base64UTF16 = function (s) {
        var bytes = [], out = "", abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", i, a, b, c;
        for (i = 0; i < s.length; i++) { bytes.push(s.charCodeAt(i) & 255); bytes.push(s.charCodeAt(i) >> 8); }
        for (i = 0; i < bytes.length; i += 3) {
            a = bytes[i]; b = bytes[i + 1]; c = bytes[i + 2];
            out += abc.charAt(a >> 2) + abc.charAt(((a & 3) << 4) | ((b || 0) >> 4));
            out += i + 1 < bytes.length ? abc.charAt(((b & 15) << 2) | ((c || 0) >> 6)) : "=";
            out += i + 2 < bytes.length ? abc.charAt(c & 63) : "=";
        }
        return out;
    };
    return C;
}());

(function (C) {
    if (typeof app === "undefined") { return; } // host-independent tests
    if (parseFloat(app.version) < 17) { alert("LaTeX2InD requires InDesign 2022 (17.0) or newer. InDesign 2022 compatibility is experimental; the supported target is 2023 onward."); return; }
    if ($.global.LaTeX2InDWindow) {
        try { $.global.LaTeX2InDWindow.show(); return; } catch (ignored) {}
    }
    var isMac = /mac/i.test($.os), engines = ["pdflatex", "xelatex", "lualatex"];
    var state = {job: null, idle: null, editing: null, folder: null, libraryPath: null, busy: false, discarded: [], cleanupIdle: null};
    var LABEL = "LaTeX2InD.id", OFFSET = "LaTeX2InD.baselineOffset";

    // Files and project records ------------------------------------------------
    function read(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) { throw Error("Cannot read " + file.fsName); }
        var value;
        try { value = file.read(); } finally { file.close(); }
        return value;
    }
    function write(file, value) {
        file.encoding = "UTF-8"; file.lineFeed = "Unix";
        if (!file.open("w")) { throw Error("Cannot write " + file.fsName); }
        try { if (!file.write(value)) { throw Error("Write failed: " + file.fsName); } } finally { file.close(); }
    }
    function folder(path) {
        var f = new Folder(path);
        if (!f.exists && !f.create()) { throw Error("Cannot create folder: " + f.fsName); }
        return f;
    }
    function copy(from, to) {
        if (!from.copy(to.fsName)) { throw Error("Cannot copy " + from.fsName + " to " + to.fsName); }
    }
    function remove(file) { if (file.exists && !file.remove()) { throw Error("Cannot replace " + file.fsName + ". It may be open in another application."); } }
    // Delete only recognized, completed build folders, never user files or links.
    function cleanJob(dir) {
        if (!dir.exists) { return true; }
        var terminal = new File(dir.fullName + "/status.txt");
        if (dir.alias || !terminal.exists || new File(dir.fullName + "/recovery.keep").exists) { return false; }
        var files = dir.getFiles(), i, name;
        var generated = /^(equation\.(tex|pdf|aux|log|metrics|out|toc|fls|fdb_latexmk|synctex|synctex\.gz)|macros\.tex|record\.xml|project\.txt|console\.txt|run\.sh|run\.ps1|launch\.bat|status\.tmp|status\.txt|discarded\.marker|cleanup\.marker|backup-[0-3])$/;
        for (i = 0; i < files.length; i++) {
            if (files[i] instanceof Folder || files[i].alias || !generated.test(files[i].name)) { return false; }
        }
        // Keep the completion marker until everything else has been removed so
        // partial cleanup (e.g. a Windows file lock) can be retried safely.
        for (i = 0; i < files.length; i++) {
            name = files[i].name;
            if (name !== "status.txt" && name !== "cleanup.marker" && name !== "project.txt" && !files[i].remove()) { return false; }
        }
        var projectMarker = new File(dir.fullName + "/project.txt");
        if (projectMarker.exists && !projectMarker.remove()) { return false; }
        var marker = new File(dir.fullName + "/cleanup.marker");
        if (marker.exists && !marker.remove()) { return false; }
        if (!terminal.remove()) { return false; }
        return dir.remove();
    }
    function retainFailure(job) {
        var diagnostic = folder(job.p.aux.fullName + "/last-error");
        var names = ["equation.tex", "macros.tex"], i, source, target;
        for (i = 0; i < names.length; i++) {
            source = new File(job.dir.fullName + "/" + names[i]);
            target = new File(diagnostic.fullName + "/" + names[i]);
            if (source.exists) { copy(source, target); }
            else { remove(target); }
        }
        source = new File(job.dir.fullName + "/equation.log");
        if (!source.exists) { source = new File(job.dir.fullName + "/console.txt"); }
        target = new File(diagnostic.fullName + "/equation.log");
        if (source.exists) { copy(source, target); }
        else { write(target, "The compiler did not produce a log. Check that the selected compiler is installed and can launch.\n"); }
        state.folder = diagnostic;
        cleanJob(job.dir);
    }
    function pruneJobRoot(p, jobs, temporary) {
        if (!jobs.exists || jobs.alias) { return; }
        var dirs = jobs.getFiles(), i, dir, terminal, record, saved;
        for (i = 0; i < dirs.length; i++) {
            dir = dirs[i];
            if (!(dir instanceof Folder) || dir.alias || !/^job-\d+-\d+$/.test(dir.name)) { continue; }
            try {
                if (temporary) {
                    var owner = new File(dir.fullName + "/project.txt");
                    if (!owner.exists || !samePath(read(owner), p.eq.fsName)) { continue; }
                }
                if (state.job && samePath(state.job.dir.fsName, dir.fsName)) { continue; }
                terminal = new File(dir.fullName + "/status.txt");
                if (!terminal.exists || new Date().getTime() - terminal.modified.getTime() < 60000 || new File(dir.fullName + "/recovery.keep").exists) { continue; }
                if (new File(dir.fullName + "/discarded.marker").exists || new File(dir.fullName + "/cleanup.marker").exists) { cleanJob(dir); continue; }
                record = new File(dir.fullName + "/record.xml");
                if (C.trim(read(terminal)) !== "0" || !record.exists) { continue; }
                record = C.parse(read(record));
                if (C.safeName(record.id) !== record.id) { continue; }
                saved = recordFolder(p, record.id);
                // Old successful build history is disposable only if a complete
                // current equation record and linked PDF have been published.
                if (!pdfFile(p, record.id).exists || !new File(saved.fullName + "/record.xml").exists || !new File(saved.fullName + "/equation.tex").exists || !new File(saved.fullName + "/macros.tex").exists) { continue; }
                if (loadRecord(p, record.id).id === record.id) { cleanJob(dir); }
            } catch (ignoredCleanup) {} // An uncertain build is left intact.
        }
        if (!jobs.getFiles().length) { jobs.remove(); }
    }
    function pruneJobs(p) {
        // Migration only: never create a jobs folder in the project again.
        pruneJobRoot(p, new Folder(p.aux.fullName + "/jobs"), false);
        pruneJobRoot(p, new Folder(Folder.temp.fullName + "/LaTeX2InD"), true);
    }
    function createJobFolder(p) {
        var root = folder(Folder.temp.fullName + "/LaTeX2InD"), dir;
        do { dir = new Folder(root.fullName + "/job-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000000000)); } while (dir.exists);
        folder(dir.fullName);
        write(new File(dir.fullName + "/project.txt"), p.eq.fsName);
        return dir;
    }
    function projectMacroFile(p) {
        var legacy = new File(p.eq.fullName + "/macros.tex");
        return legacy.exists ? legacy : new File(p.aux.fullName + "/macros.tex");
    }
    function installMacros(p, source) {
        var target = projectMacroFile(p);
        if (samePath(source.fsName, target.fsName)) { return target; }
        var suffix = new Date().getTime() + "-" + Math.floor(Math.random() * 1000000000);
        var staged = new File(target.parent.fullName + "/macros-import-" + suffix + ".tmp");
        var backup = new File(target.parent.fullName + "/macros-backup-" + suffix + ".tmp");
        var hadTarget = target.exists, touched = false, restored = false;
        try {
            copy(source, staged);
            if (hadTarget) { copy(target, backup); }
            touched = true;
            remove(target); copy(staged, target);
            restored = true;
            return target;
        } catch (e) {
            if (touched) {
                try { remove(target); if (hadTarget) { copy(backup, target); } restored = true; }
                catch (restoreError) { throw Error(e.message + "\nPrevious macros could not be restored. Recovery copy: " + backup.fsName); }
            }
            throw e;
        } finally {
            if (staged.exists) { staged.remove(); }
            if ((!touched || restored) && backup.exists) { backup.remove(); }
        }
    }
    function discardJob(job) {
        try { write(new File(job.dir.fullName + "/discarded.marker"), "Discarded; clean only after status.txt exists.\n"); } catch (ignored) {}
        state.discarded.push({job: job, until: new Date().getTime() + 600000});
        if (!state.cleanupIdle) {
            state.cleanupIdle = app.idleTasks.add({name: "LaTeX2InD.cleanup", sleep: 1000});
            state.cleanupIdle.addEventListener(IdleEvent.ON_IDLE, function () {
                for (var i = state.discarded.length - 1; i >= 0; i--) {
                    var pending = state.discarded[i], done = false;
                    try { done = cleanJob(pending.job.dir); } catch (ignored) {}
                    if (done || new Date().getTime() > pending.until) { state.discarded.splice(i, 1); }
                }
                if (!state.discarded.length) { state.cleanupIdle.remove(); state.cleanupIdle = null; }
            });
        }
    }
    function project() {
        if (!app.documents.length || !app.layoutWindows.length) { throw Error("Open a document in a layout window first."); }
        var doc = app.activeDocument;
        if (!doc.saved) { throw Error("Save the InDesign document before using LaTeX2InD."); }
        var eq = folder(doc.filePath.fullName + "/equations"), aux = folder(eq.fullName + "/auxiliary");
        return {doc: doc, eq: eq, aux: aux, page: app.activeWindow.activePage, layer: doc.activeLayer};
    }
    function recordFolder(p, id) { return new Folder(p.aux.fullName + "/record-" + id); }
    function pdfFile(p, id) { return new File(p.eq.fullName + "/" + id + ".pdf"); }
    function uniqueID(p, name) {
        var root = C.safeName(name), id = root, n = 2;
        while (pdfFile(p, id).exists || recordFolder(p, id).exists) { id = root + "_" + n++; }
        return id;
    }
    function samePath(a, b) {
        var x = new File(a).fsName, y = new File(b).fsName;
        return isMac ? x === y : x.toLowerCase() === y.toLowerCase();
    }
    function loadRecord(p, id) {
        var f = new File(recordFolder(p, id).fullName + "/record.xml"), r;
        if (f.exists) {
            r = C.parse(read(f));
            if (r.id !== id) { throw Error("The equation record does not match its PDF."); }
            return r;
        }
        // Import old side-by-side .tex files without modifying them.
        f = new File(p.eq.fullName + "/" + id + ".tex");
        if (!f.exists) { throw Error("No editable source was found for " + id + ". The old script may have deleted its .tex file. You can still place the PDF, or enter its source to create a new equation."); }
        var tex = read(f), body = tex.match(/\\begin\{document\}([\s\S]*)\\end\{document\}/), size = tex.match(/fontsize=([\d.]+)/);
        if (!body) { throw Error("Cannot recognize the legacy .tex document. Copy its equation into the editor using LaTeX block mode."); }
        return {version: "1", id: id, source: C.trim(body[1]), mode: "raw", size: size ? size[1] : "12", engine: "pdflatex", width: "", height: "", depth: "", padding: "0.5"};
    }

    // Compiler discovery. No shell parsing of user paths is used here. ---------
    function discover(engine) {
        var dirs = [], i, j, f, roots, children;
        var envPath = $.getenv("PATH") || "";
        dirs = envPath.split(isMac ? ":" : ";");
        if (isMac) {
            dirs = ["/Library/TeX/texbin", "/usr/texbin", "/opt/homebrew/bin", "/usr/local/bin", "~/bin", "~/Library/Application Support/MiKTeX/texmfs/install/miktex/bin"].concat(dirs);
            roots = ["/usr/local/texlive", "~/Library/TinyTeX"];
        } else {
            var local = $.getenv("LOCALAPPDATA") || "", pf = $.getenv("ProgramFiles") || "C:/Program Files", pfx = $.getenv("ProgramFiles(x86)") || "C:/Program Files (x86)";
            dirs = [local + "/Programs/MiKTeX/miktex/bin/x64", pf + "/MiKTeX/miktex/bin/x64", pfx + "/MiKTeX/miktex/bin", local + "/Programs/MiKTeX/miktex/bin", ($.getenv("APPDATA") || "") + "/TinyTeX/bin/windows"].concat(dirs);
            roots = ["C:/texlive", "D:/texlive"];
        }
        var suffixes = isMac ? ["/bin/universal-darwin", "/bin/x86_64-darwin", "/bin/arm64-darwin"] : ["/bin/windows", "/bin/win32"];
        for (i = 0; i < roots.length; i++) {
            f = new Folder(roots[i]);
            if (!f.exists) { continue; }
            children = f.getFiles(function (item) { return item instanceof Folder; });
            children.sort(function (a, b) { return a.name < b.name ? 1 : -1; });
            children.unshift(f);
            for (j = 0; j < children.length; j++) {
                for (var k = 0; k < suffixes.length; k++) { dirs.push(children[j].fullName + suffixes[k]); }
            }
        }
        for (i = 0; i < dirs.length; i++) {
            if (!C.trim(dirs[i])) { continue; }
            f = new File(dirs[i].replace(/^"|"$/g, "") + "/" + engine + (isMac ? "" : ".exe"));
            if (f.exists) { return f; }
        }
        return null;
    }
    function launch(job, executable) {
        // The isolated build now lives in the OS temp directory. Resolve input
        // search roots from there so project-local \input dependencies still work.
        var roots = [job.p.eq, job.p.aux, job.p.doc.filePath], inputs = [];
        for (var i = 0; i < roots.length; i++) {
            inputs.push(decodeURI(roots[i].getRelativeURI(job.dir.fullName)));
        }
        if (isMac) {
            var sh = new File(job.dir.fullName + "/run.sh");
            write(sh, C.macRunner(job.dir.fsName, executable.fsName, inputs));
            var command = "/bin/sh " + C.sh(sh.fsName) + " >/dev/null 2>&1 &";
            app.doScript("do shell script " + C.apple(command), ScriptLanguage.APPLESCRIPT_LANGUAGE);
        } else {
            // EncodedCommand avoids cmd.exe expansion of %, &, Unicode and quotes.
            var ps = C.windowsRunner(job.dir.fsName, executable.fsName, inputs);
            write(new File(job.dir.fullName + "/run.ps1"), ps);
            var powershell = ($.getenv("SystemRoot") || "C:\\Windows") + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            var commandLine = '"' + powershell + '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + C.base64UTF16(ps);
            try {
                app.doScript('CreateObject("WScript.Shell").Run "' + commandLine.replace(/"/g, '""') + '", 0, False', ScriptLanguage.VISUAL_BASIC);
            } catch (vbError) {
                // Some recent Windows installations omit the optional VBScript engine.
                // A batch launcher uses the same encoded payload; it may briefly flash a console.
                var bat = new File(job.dir.fullName + "/launch.bat");
                write(bat, "@echo off\r\n" + commandLine + "\r\n");
                if (!bat.execute()) { throw Error("Windows could not launch PowerShell. " + vbError.message); }
            }
        }
    }

    // Placement and updating ---------------------------------------------------
    function selectedFrame() {
        if (app.selection.length !== 1) { return null; }
        var item = app.selection[0];
        if (item.constructor.name === "PDF") { item = item.parent; }
        // Never mistake a selected text frame/group containing one inline PDF
        // for that PDF's own frame: fitting it would change the text layout.
        if (!/^(Rectangle|Oval|Polygon)$/.test(item.constructor.name)) { return null; }
        try { if (item.graphics.length === 1 && item.graphics[0].itemLink) { return item; } } catch (ignored) {}
        return null;
    }
    function selectedPoint() {
        if (app.selection.length !== 1) { return null; }
        var item = app.selection[0];
        if (item.constructor.name === "InsertionPoint") { return item; }
        // Do not silently replace a selected text range or insert into a selected frame.
        return null;
    }
    function baseline(frame, r) {
        if (frame.parent.constructor.name !== "Character") { return; }
        if (frame.anchoredObjectSettings.anchoredPosition !== AnchorPosition.INLINE_POSITION) { return; }
        var scale = Math.abs(frame.allGraphics[0].absoluteVerticalScale) / 100;
        var shift = -(Number(r.depth) + Number(r.padding)) * scale;
        var previous = frame.extractLabel(OFFSET), current = Number(frame.parent.baselineShift);
        // Preserve any manual adjustment made since our last automatic alignment.
        var manual = previous !== "" ? current - Number(previous) : 0;
        frame.parent.baselineShift = shift + manual;
        frame.insertLabel(OFFSET, String(shift));
    }
    function withPoints(fn) {
        var previous = app.scriptPreferences.measurementUnit;
        try { app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS; return fn(); }
        finally { app.scriptPreferences.measurementUnit = previous; }
    }
    function place(p, r, file, mode, point, wrap) {
        var frame = null, prefs = app.pdfPlacePreferences, oldCrop = prefs.pdfCrop, oldPage = prefs.pageNumber;
        try {
            prefs.pdfCrop = PDFCrop.CROP_MEDIA; prefs.pageNumber = 1;
            if (mode !== "page" && (!point || !point.isValid)) { throw Error("Place the text cursor at an insertion point before choosing inline or above-line placement."); }
            frame = p.page.rectangles.add(p.layer, undefined, undefined, {geometricBounds: [0, 0, 10, 10], strokeWeight: 0, fillColor: p.doc.swatches.itemByName("None")});
            frame.frameFittingOptions.autoFit = false;
            frame.place(file);
            frame.allGraphics[0].horizontalScale = 100; frame.allGraphics[0].verticalScale = 100;
            frame.fit(FitOptions.FRAME_TO_CONTENT);
            frame.insertLabel(LABEL, r.id);
            frame.textWrapPreferences.textWrapMode = TextWrapModes.NONE;
            if (mode !== "inline" && wrap) {
                frame.textWrapPreferences.textWrapMode = [TextWrapModes.NONE, TextWrapModes.BOUNDING_BOX_TEXT_WRAP, TextWrapModes.JUMP_OBJECT_TEXT_WRAP][wrap.mode];
                frame.textWrapPreferences.textWrapOffset = wrap.offsets;
                frame.textWrapPreferences.textWrapSide = TextWrapSideOptions.BOTH_SIDES;
            }
            if (mode !== "page") {
                frame.anchoredObjectSettings.insertAnchoredObject(point, mode === "inline" ? AnchorPosition.INLINE_POSITION : AnchorPosition.ABOVE_LINE);
                if (mode === "inline") { baseline(frame, r); }
                else { frame.anchoredObjectSettings.horizontalAlignment = HorizontalAlignment.CENTER_ALIGN; }
            } else {
                var bounds = p.page.bounds;
                frame.move([bounds[1] + 18, bounds[0] + 18]);
            }
            return frame;
        } catch (e) {
            if (frame && frame.isValid) { frame.remove(); }
            throw e;
        } finally { prefs.pdfCrop = oldCrop; prefs.pageNumber = oldPage; }
    }
    function linkedFrames(p, id) {
        var result = [], links = p.doc.links, i, link;
        for (i = 0; i < links.length; i++) {
            link = links[i];
            try { if (samePath(link.filePath, pdfFile(p, id).fsName)) { result.push(link.parent.parent); } } catch (ignored) {}
        }
        return result;
    }
    function replaceFrame(frame, r, file) {
        if (!frame || !frame.isValid) { throw Error("The selected equation was removed while LaTeX was compiling."); }
        var graphic = frame.allGraphics[0], link = graphic.itemLink;
        var sx = graphic.horizontalScale, sy = graphic.verticalScale, bounds = frame.geometricBounds;
        var autoFit = frame.frameFittingOptions.autoFit;
        try {
            frame.frameFittingOptions.autoFit = false;
            link.relink(file); link.update();
            graphic = frame.allGraphics[0]; graphic.horizontalScale = sx; graphic.verticalScale = sy;
            frame.fit(FitOptions.FRAME_TO_CONTENT);
            if (frame.parent.constructor.name !== "Character") { frame.move([bounds[1], bounds[0]]); }
        } finally { frame.frameFittingOptions.autoFit = autoFit; }
        frame.insertLabel(LABEL, r.id); baseline(frame, r);
    }

    // Transactional disk publication: keep a rollback copy in the job folder.
    function publish(job) {
        var recordDir = folder(recordFolder(job.p, job.r.id).fullName);
        var pairs = [
            [new File(job.dir.fullName + "/equation.pdf"), pdfFile(job.p, job.r.id)],
            [new File(job.dir.fullName + "/equation.tex"), new File(recordDir.fullName + "/equation.tex")],
            [new File(job.dir.fullName + "/record.xml"), new File(recordDir.fullName + "/record.xml")],
            [new File(job.dir.fullName + "/macros.tex"), new File(recordDir.fullName + "/macros.tex")]
        ];
        var backups = [], i, b;
        try {
            for (i = 0; i < pairs.length; i++) {
                b = new File(job.dir.fullName + "/backup-" + i);
                if (pairs[i][1].exists) { copy(pairs[i][1], b); }
                backups.push({target: pairs[i][1], backup: b});
                remove(pairs[i][1]); copy(pairs[i][0], pairs[i][1]);
            }
        } catch (e) {
            var failures = [];
            for (i = backups.length - 1; i >= 0; i--) {
                try { remove(backups[i].target); if (backups[i].backup.exists) { copy(backups[i].backup, backups[i].target); } }
                catch (restoreError) { failures.push(restoreError.message); }
            }
            throw Error(e.message + (failures.length ? "\nRecovery files remain in " + job.dir.fsName + "\n" + failures.join("\n") : "\nPrevious files have been restored."));
        }
    }
    function finish(job) {
        var measurements = C.metrics(read(new File(job.dir.fullName + "/equation.metrics"))), key;
        for (key in measurements) { if (measurements.hasOwnProperty(key)) { job.r[key] = measurements[key]; } }
        if (!job.p.doc.isValid) { throw Error("The destination document was closed. Nothing was published."); }
        if (!samePath(job.p.doc.filePath.fullName + "/equations", job.p.eq.fsName)) { throw Error("The document moved while compiling. Nothing was published; run the action again."); }
        if (job.action === "copy" && (!job.frame || !job.frame.isValid)) { throw Error("The selected equation no longer exists. Nothing was published."); }
        if (job.action === "create" && job.placement !== "page" && (!job.point || !job.point.isValid)) { throw Error("The insertion point no longer exists. Nothing was published."); }
        if (job.action === "create" && job.placement !== "page" && job.point.parentStory.contents !== job.storyText) { throw Error("The destination story changed while compiling. Nothing was published; place the cursor and try again."); }
        if (job.action === "create" && (!job.p.page.isValid || !job.p.layer.isValid || job.p.layer.locked)) { throw Error("The destination page/layer is unavailable or locked. Nothing was published."); }
        write(new File(job.dir.fullName + "/record.xml"), C.serialize(job.r));
        write(new File(job.dir.fullName + "/recovery.keep"), "Publication/update in progress. Preserve recovery files if interrupted.\n");
        publish(job);
        var targets = job.action === "update" ? linkedFrames(job.p, job.r.id) : [], failures = [];
        app.doScript(function () {
            withPoints(function () {
                if (job.action === "create") { place(job.p, job.r, pdfFile(job.p, job.r.id), job.placement, job.point, job.wrap); }
                else if (job.action === "copy") { replaceFrame(job.frame, job.r, pdfFile(job.p, job.r.id)); }
                else {
                    for (var i = 0; i < targets.length; i++) {
                        try { replaceFrame(targets[i], job.r, pdfFile(job.p, job.r.id)); }
                        catch (e) { failures.push(e.message); }
                    }
                }
                job.p.doc.recompose();
            });
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "LaTeX2InD " + job.action);
        // Load the published record, including its style and new identity, so
        // subsequent Modify actions target the independent copy, not its source.
        fillEditor(job.p, job.r.id, job.action === "create" ? null : job.frame);
        try { refreshLibrary(app.activeDocument.id === job.p.doc.id ? job.r.id : null); } catch (ignoredRefresh) {}
        var msg = "Saved " + job.r.id + ".pdf" + (targets.length ? "; refreshed " + (targets.length - failures.length) + " linked placement(s)." : ".");
        if (job.placement === "inline" && job.action === "create") { msg += " Check leading/baseline-grid clearance for tall formulas."; }
        if (failures.length) { msg += " Some placements need attention: " + failures.join("; "); }
        status.text = msg;
        if (!failures.length) {
            write(new File(job.dir.fullName + "/cleanup.marker"), "Published successfully; temporary files may be removed.\n");
            remove(new File(job.dir.fullName + "/recovery.keep"));
            if (!cleanJob(job.dir)) { status.text += " Temporary files could not all be removed; cleanup will retry on Refresh."; }
            state.folder = recordFolder(job.p, job.r.id);
        }
    }
    function stopIdle() {
        if (state.idle) { try { state.idle.remove(); } catch (ignored) {} state.idle = null; }
    }
    function setBusy(value) {
        state.busy = value; controls.enabled = !value; editor.enabled = !value;
        cancelButton.enabled = value; closeButton.enabled = !value; addMacros.enabled = !value;
    }
    function poll() {
        var job = state.job;
        if (!job) { return; }
        var statusFile = new File(job.dir.fullName + "/status.txt");
        if (!statusFile.exists && new Date().getTime() - job.started < 120000) { return; }
        stopIdle();
        try {
            if (!statusFile.exists) { discardJob(job); throw Error("Compilation exceeded two minutes. Its output will not be published. Temporary files will be removed after the compiler finishes."); }
            if (C.trim(read(statusFile)) !== "0" || !new File(job.dir.fullName + "/equation.pdf").exists) {
                retainFailure(job);
                throw Error("LaTeX compilation failed. Check the log for a syntax error or missing package. Your existing PDF and editor contents have been preserved.");
            }
            finish(job);
        } catch (e) { status.text = e.message; alert(e.message + "\n\nFiles: " + (state.folder || job.dir).fsName); }
        finally { state.job = null; setBusy(false); }
    }
    function start(action) {
        var p = project(), editing = state.editing, engine = engines[engineChoice.selection.index];
        if (action !== "create" && (!editing || !editing.p.doc.isValid || editing.p.doc.id !== p.doc.id || !samePath(editing.p.eq.fsName, p.eq.fsName))) { throw Error("Load an equation from this document before updating it."); }
        if (action === "copy" && (!editing.frame || !editing.frame.isValid)) { throw Error("Use Load selected first to choose the occurrence to make independent."); }
        var executable = discover(engine);
        if (!executable) { throw Error("Cannot find " + engine + ". Install a TeX distribution in a standard location, or add its binary folder to PATH and restart InDesign."); }
        var modes = ["inline", "display", "raw"], placements = ["page", "inline", "above"];
        // Display style in New equation configures new assets. Existing assets
        // retain their stored style when modified or made independent.
        var mode = action === "create" ? modes[mathChoice.selection.index] : loadRecord(p, editing.id).mode;
        var id;
        if (action === "copy") {
            id = C.independentName(independentNameInput.text);
            if (id.toLowerCase() === editing.id.toLowerCase() || uniqueID(p, id) !== id) {
                throw Error("An equation named " + id + " already exists. Choose a different name; existing equations will not be overwritten.");
            }
        } else { id = action === "update" ? editing.id : uniqueID(p, nameInput.text); }
        var r = {version: "1", id: id, source: editor.text, mode: mode, size: C.size(sizeInput.text), engine: engine};
        if (action !== "create" && r.mode !== "inline") {
            var affected = action === "copy" ? [editing.frame] : linkedFrames(p, editing.id);
            for (var a = 0; a < affected.length; a++) {
                if (affected[a].parent.constructor.name === "Character" && affected[a].anchoredObjectSettings.anchoredPosition === AnchorPosition.INLINE_POSITION) {
                    throw Error("This equation has an inline occurrence. Keep Inline math mode, or create a separate equation for display/block output.");
                }
            }
        }
        var placement = placements[placementChoice.selection.index], point = selectedPoint(), wrap = action === "create" ? wrapOptions(placement) : null;
        if (action === "create" && placement !== "page" && !point) { throw Error("Place a text cursor in the document, then try again. Selected text is never replaced by this version."); }
        if (action === "create" && placement === "inline" && r.mode !== "inline") { throw Error("Choose Inline math for baseline-aware inline placement. Display math and LaTeX blocks can be placed on the page or above a line."); }
        // Validate before making a job directory.
        C.tex(r, false);
        pruneJobs(p);
        var dir = createJobFolder(p);
        var macroCandidates = [new File(p.eq.fullName + "/macros.tex"), new File(p.aux.fullName + "/macros.tex")], macro = null;
        if (action !== "create") { macroCandidates.push(new File(recordFolder(p, editing.id).fullName + "/macros.tex")); }
        for (var i = 0; i < macroCandidates.length; i++) { if (macroCandidates[i].exists) { macro = macroCandidates[i]; break; } }
        if (macro) { copy(macro, new File(dir.fullName + "/macros.tex")); }
        else { write(new File(dir.fullName + "/macros.tex"), "% No project macros were supplied.\n"); }
        write(new File(dir.fullName + "/equation.tex"), C.tex(r, true));
        state.folder = dir;
        var job = {p: p, r: r, action: action, dir: dir, placement: placement, point: point, wrap: wrap, frame: editing ? editing.frame : null, started: new Date().getTime()};
        job.storyText = point ? point.parentStory.contents : null;
        state.job = job; setBusy(true); status.text = "Compiling " + r.id + " with " + executable.fsName + " …";
        try {
            launch(job, executable);
            state.idle = app.idleTasks.add({name: "LaTeX2InD.compile", sleep: 250});
            state.idle.addEventListener(IdleEvent.ON_IDLE, poll);
        } catch (e) { state.job = null; stopIdle(); setBusy(false); throw e; }
    }

    // Resizable modeless UI ----------------------------------------------------
    var win = new Window("palette", "LaTeX2InD", undefined, {resizeable: true});
    $.global.LaTeX2InDWindow = win;
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.spacing = 10; win.margins = 14;
    var columns = win.add("group"); columns.orientation = "row";
    columns.alignment = ["fill", "fill"]; columns.alignChildren = ["fill", "fill"]; columns.spacing = 14;
    var inputColumn = columns.add("group"); inputColumn.orientation = "column";
    inputColumn.alignment = ["fill", "fill"]; inputColumn.alignChildren = ["fill", "top"];
    var inputHint = inputColumn.add("statictext", undefined, "Enter a formula without math delimiters:");
    var editor = inputColumn.add("edittext", undefined, "", {multiline: true, wantReturn: true, scrolling: true});
    editor.alignment = ["fill", "fill"]; editor.preferredSize = [465, 470]; editor.minimumSize = [280, 240];
    editor.helpTip = "Enter a formula without delimiters, or choose LaTeX block for existing code.";
    var controls = columns.add("group"); controls.orientation = "column";
    controls.alignment = ["right", "top"]; controls.alignChildren = ["fill", "top"]; controls.spacing = 8;
    controls.minimumSize.width = 310; controls.preferredSize.width = 310;
    function panel(title) {
        var item = controls.add("panel", undefined, title);
        item.orientation = "column"; item.alignChildren = ["fill", "top"]; item.spacing = 6; item.margins = [12, 16, 12, 10];
        return item;
    }
    function fieldRow(parent, label) {
        var group = parent.add("group"); group.alignChildren = ["left", "center"];
        var text = group.add("statictext", undefined, label); text.preferredSize.width = 82;
        return group;
    }
    var newPanel = panel("New equation");
    var row = fieldRow(newPanel, "Name:");
    var nameInput = row.add("edittext", undefined, ""); nameInput.alignment = ["fill", "center"];
    nameInput.helpTip = "Optional. Leave blank to use equation, equation_2, and so on.";
    row = fieldRow(newPanel, "Size (pt):");
    var sizeInput = row.add("edittext", undefined, "12"); sizeInput.characters = 6;
    var matchSize = row.add("button", undefined, "From text");
    row = fieldRow(newPanel, "Display style:");
    var mathChoice = row.add("dropdownlist", undefined, ["Inline math", "Display math", "LaTeX block"]); mathChoice.selection = 0; mathChoice.alignment = ["fill", "center"];
    row = fieldRow(newPanel, "Placement:");
    var placementChoice = row.add("dropdownlist", undefined, ["Place on page", "Inline at cursor", "Above line at cursor"]); placementChoice.selection = 0; placementChoice.alignment = ["fill", "center"];
    row = fieldRow(newPanel, "Compiler:");
    var engineChoice = row.add("dropdownlist", undefined, engines); engineChoice.selection = 0; engineChoice.alignment = ["fill", "center"];
    row = newPanel.add("group"); row.alignment = ["right", "top"];
    var createButton = row.add("button", undefined, "Create");
    createButton.helpTip = "Compile a new equation and place its linked PDF using the selected placement mode.";

    var wrapPanel = panel("Text wrap");
    row = fieldRow(wrapPanel, "Wrap setting:");
    var wrapChoice = row.add("dropdownlist", undefined, ["None", "Bounding box", "Jump object"]); wrapChoice.selection = 0; wrapChoice.alignment = ["fill", "center"];
    // Keep the original two-by-two arrangement and T, L, B, R storage order.
    var wrapInputs = [], wrapLabels = ["T", "L", "B", "R"], wrapNames = ["Top", "Left", "Bottom", "Right"];
    var wrapGrid = wrapPanel.add("group"); wrapGrid.orientation = "column"; wrapGrid.alignment = ["left", "top"]; wrapGrid.spacing = 4;
    for (var wi = 0; wi < wrapLabels.length; wi++) {
        if (wi % 2 === 0) { row = wrapGrid.add("group"); row.spacing = 10; }
        row.add("statictext", undefined, wrapLabels[wi]);
        var wrapInput = row.add("edittext", undefined, "0 pt"); wrapInput.characters = 7;
        wrapInput.helpTip = wrapNames[wi] + " text-wrap margin (for example, 2 mm)."; wrapInputs.push(wrapInput);
    }

    var libraryPanel = panel("Project equations");
    var library = libraryPanel.add("dropdownlist", undefined, []); library.alignment = ["fill", "top"];
    row = fieldRow(libraryPanel, "Placement:");
    var projectPlacementChoice = row.add("dropdownlist", undefined, ["Place on page", "Inline at cursor", "Above line at cursor"]);
    projectPlacementChoice.selection = 0; projectPlacementChoice.alignment = ["fill", "center"];
    projectPlacementChoice.helpTip = "Placement for existing project equations; independent of New equation placement.";
    row = libraryPanel.add("group"); row.spacing = 5; row.alignment = ["fill", "top"];
    var loadLibrary = row.add("button", undefined, "Load Tex");
    var update = row.add("button", undefined, "Modify");
    var placeSpacer = row.add("group"); placeSpacer.alignment = ["fill", "fill"]; placeSpacer.preferredSize.width = 0;
    var addExisting = row.add("button", undefined, "Place");
    loadLibrary.preferredSize.width = 76;
    update.preferredSize.width = 70;
    var placeButtonWidth = Math.ceil(addExisting.graphics.measureString(addExisting.text).width) + 28;
    addExisting.preferredSize.width = placeButtonWidth;
    addExisting.minimumSize.width = placeButtonWidth; addExisting.maximumSize.width = placeButtonWidth;
    addExisting.alignment = ["right", "center"];
    update.helpTip = "Update the loaded equation's shared PDF and every matching link in this document.";

    var selectPanel = panel("Select");
    row = selectPanel.add("group"); row.alignChildren = ["left", "center"];
    row.add("statictext", undefined, "Make independent to:");
    var independentNameInput = row.add("edittext", undefined, ""); independentNameInput.alignment = ["fill", "center"]; independentNameInput.minimumSize.width = 100;
    independentNameInput.helpTip = "Required new equation name: letters, numbers, hyphens or underscores. Existing names are not overwritten.";
    row = selectPanel.add("group"); row.alignment = ["fill", "fill"];
    var loadSelection = row.add("button", undefined, "Load selected");
    var independentSpacer = row.add("group"); independentSpacer.alignment = ["fill", "fill"]; independentSpacer.preferredSize.width = 0;
    var independent = row.add("button", undefined, "Make independent");
    var independentButtonWidth = Math.ceil(independent.graphics.measureString(independent.text).width) + 28;
    independent.minimumSize.width = independentButtonWidth; independent.maximumSize.width = independentButtonWidth;
    independent.alignment = ["right", "center"];
    independent.helpTip = "Use the name above to create a separate linked PDF for the loaded occurrence, then load the new equation.";

    var information = win.add("panel", undefined, "Information");
    information.orientation = "column"; information.alignChildren = ["fill", "top"]; information.spacing = 5; information.margins = [12, 16, 12, 10];
    function informationRow(label) {
        var group = information.add("group"); group.alignment = ["fill", "top"]; group.alignChildren = ["left", "top"];
        var caption = group.add("statictext", undefined, label); caption.preferredSize.width = 125;
        return group;
    }
    row = informationRow("Compiler location:");
    var compilerStatus = row.add("statictext", undefined, "", {truncate: "middle"}); compilerStatus.alignment = ["fill", "top"]; compilerStatus.preferredSize.width = 400;
    row = informationRow("Loaded equation:");
    var editingLabel = row.add("statictext", undefined, "No equation loaded for editing.", {truncate: "middle"}); editingLabel.alignment = ["fill", "top"];
    row = informationRow("Status:");
    var status = row.add("statictext", undefined, "Ready. PDFs remain linked in the project's equations folder.", {multiline: true}); status.preferredSize.height = 42; status.alignment = ["fill", "top"];
    row = information.add("group");
    var refresh = row.add("button", undefined, "Refresh"); refresh.helpTip = "Refresh the active project's equation list.";
    var addMacros = row.add("button", undefined, "Add macros");
    var jobsButton = row.add("button", undefined, "Show last job"), cancelButton = row.add("button", undefined, "Discard pending result"); cancelButton.enabled = false;
    row = win.add("group"); row.alignment = ["right", "bottom"];
    var closeButton = row.add("button", undefined, "Close");

    function guard(fn) { return function () { try { fn(); } catch (e) { status.text = e.message; alert(e.message); } }; }
    function wrapOptions(placement) {
        var result = {mode: wrapChoice.selection.index, offsets: [0, 0, 0, 0]};
        if (placement === "inline" || result.mode === 0) { return result; }
        for (var i = 0; i < wrapInputs.length; i++) {
            var text = C.trim(wrapInputs[i].text) || "0 pt";
            if (/^[\d.]+$/.test(text)) { text += " pt"; }
            var unit = new UnitValue(text), value = unit.as("pt");
            if (unit.type === "?" || !isFinite(value) || value < 0) { throw Error("Text-wrap margins must be non-negative measurements, such as 2 mm or 4 pt."); }
            result.offsets[i] = value;
        }
        return result;
    }
    function updateEditorHint() {
        var block = mathChoice.selection.index === 2;
        inputHint.text = block ? "LaTeX block: include $...$ or \[...\]." : "Enter a formula without math delimiters:";
        editor.helpTip = block ? "A LaTeX document fragment, including your own math delimiters. Do not include documentclass or begin/end document. Use page or above-line placement." : "Enter the formula body, for example E = mc^2. Math mode is added automatically.";
    }
    function compilerInfo() {
        var found = discover(engines[engineChoice.selection.index]);
        compilerStatus.text = found ? found.fsName : "Compiler not found — install a TeX distribution or add its binary folder to PATH and restart InDesign.";
        compilerStatus.helpTip = compilerStatus.text;
    }
    function refreshLibrary(preferredID) {
        var p = project(), files = p.eq.getFiles("*.pdf"), names = [], i;
        pruneJobs(p);
        var selectedID = preferredID || (state.libraryPath && samePath(state.libraryPath, p.eq.fsName) && library.selection ? library.selection.text : null);
        state.libraryPath = p.eq.fsName;
        for (i = 0; i < files.length; i++) { names.push(decodeURI(files[i].name).replace(/\.pdf$/i, "")); }
        names.sort(); library.removeAll();
        for (i = 0; i < names.length; i++) { library.add("item", names[i]); }
        if (library.items.length) { library.selection = selectedID ? library.find(selectedID) || library.items[0] : library.items[0]; }
    }
    function libraryProject() {
        var p = project();
        if (!state.libraryPath || !samePath(state.libraryPath, p.eq.fsName)) {
            refreshLibrary(); throw Error("The active project changed. Choose an equation from the refreshed list.");
        }
        return p;
    }
    function fillEditor(p, id, frame) {
        var r = loadRecord(p, id), index = r.mode === "inline" ? 0 : r.mode === "display" ? 1 : 2;
        editor.text = r.source; nameInput.text = id; sizeInput.text = String(r.size); mathChoice.selection = index; updateEditorHint();
        independentNameInput.text = "";
        for (var i = 0; i < engines.length; i++) { if (engines[i] === r.engine) { engineChoice.selection = i; } }
        state.editing = {p: p, id: id, frame: frame};
        editingLabel.text = "Editing " + id + " — " + linkedFrames(p, id).length + " linked occurrence(s) in this document.";
        compilerInfo(); status.text = "Source loaded. Modify updates the shared PDF; Make independent changes only the loaded occurrence.";
    }
    function selectedID(p, frame) {
        if (!frame) { throw Error("Select a linked equation frame or its PDF first."); }
        var link = frame.allGraphics[0].itemLink, file = new File(link.filePath);
        if (!samePath(file.parent.fsName, p.eq.fsName)) { throw Error("Select a PDF linked from this project's equations folder."); }
        if (!/\.pdf$/i.test(file.name)) { throw Error("The selected link is not a PDF."); }
        return decodeURI(file.name).replace(/\.pdf$/i, "");
    }
    createButton.onClick = guard(function () { start("create"); });
    update.onClick = guard(function () { start("update"); });
    independent.onClick = guard(function () { start("copy"); });
    loadSelection.onClick = guard(function () {
        var p = project(), frame = selectedFrame(), id = selectedID(p, frame);
        refreshLibrary(id);
        fillEditor(p, id, frame);
    });
    refresh.onClick = guard(refreshLibrary);
    loadLibrary.onClick = guard(function () { var p = libraryProject(); if (!library.selection) { throw Error("Choose an equation first."); } fillEditor(p, library.selection.text, null); });
    addExisting.onClick = guard(function () {
        var p = libraryProject();
        if (!library.selection) { throw Error("Choose an equation first."); }
        var id = library.selection.text, mode = ["page", "inline", "above"][projectPlacementChoice.selection.index], r = {id: id}, point = selectedPoint();
        if (mode === "inline") {
            r = loadRecord(p, id);
            if (r.mode !== "inline" || r.depth === "") { throw Error("Load and recompile this equation in Inline math mode before placing it inline."); }
        }
        var wrap = wrapOptions(mode);
        app.doScript(function () { withPoints(function () { place(p, r, pdfFile(p, id), mode, point, wrap); }); }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Place LaTeX equation");
        status.text = "Placed linked PDF: " + id;
    });
    matchSize.onClick = guard(function () {
        var point = selectedPoint();
        if (!point) { throw Error("Place a text cursor in the document first."); }
        sizeInput.text = String(point.pointSize);
    });
    mathChoice.onChange = updateEditorHint;
    engineChoice.onChange = guard(compilerInfo);
    addMacros.onClick = guard(function () {
        var p = project();
        var chosen = File.openDialog("Choose a LaTeX macros file (.tex)");
        if (!chosen) { return; }
        if (!/\.tex$/i.test(chosen.name)) { throw Error("Choose a .tex file containing macro definitions and package imports, not a complete LaTeX document."); }
        var target = projectMacroFile(p);
        if (target.exists && !samePath(target.fsName, chosen.fsName) && !confirm("Replace this project's macros with the selected file? Existing PDFs stay unchanged; future compilations use the new macros.")) { return; }
        target = installMacros(p, chosen);
        status.text = "Macros added: " + target.fsName + ". New and modified equations will use them.";
    });
    jobsButton.helpTip = "Open the latest equation's saved files, error diagnostics, or active build folder.";
    jobsButton.onClick = guard(function () { if (!state.folder || !state.folder.exists) { throw Error("No retained job files in this session. Completed temporary builds are removed automatically."); } state.folder.execute(); });
    cancelButton.onClick = function () {
        if (state.job) { discardJob(state.job); }
        stopIdle(); state.job = null; setBusy(false);
        status.text = "Result discarded. Temporary files will be removed after the compiler finishes; the published equation will not change.";
    };
    closeButton.onClick = function () { win.close(); };
    win.onClose = function () {
        if (state.busy) { status.text = "Wait for compilation or discard its result before closing."; return false; }
        stopIdle(); app.insertLabel("LaTeX2InD.windowSize.compactColumns", win.size.width + "," + win.size.height);
        $.global.LaTeX2InDWindow = null; return true;
    };
    function resizeColumns() {
        win.layout.resize();
        // Divide usable column width (excluding the gutter) in a 60:40 ratio.
        var available = columns.size.width - columns.spacing;
        var leftWidth = Math.round(available * 0.6), height = columns.size.height;
        inputColumn.bounds = [0, 0, leftWidth, height];
        controls.bounds = [leftWidth + columns.spacing, 0, columns.size.width, height];
        inputColumn.layout.resize(); controls.layout.resize();
    }
    win.onResizing = win.onResize = resizeColumns;
    win.onActivate = function () {
        if (state.busy) { return; }
        try { var p = project(); if (!state.libraryPath || !samePath(state.libraryPath, p.eq.fsName)) { refreshLibrary(); } } catch (ignored) {}
    };
    win.layout.layout(true);
    // Derive the minimum from native control sizes so labels do not clip.
    win.minimumSize = [Math.max(win.size.width, Math.ceil(310 / 0.4) + columns.spacing + 28), win.size.height];
    var savedSize = app.extractLabel("LaTeX2InD.windowSize.compactColumns").split(",");
    if (savedSize.length === 2 && isFinite(Number(savedSize[0])) && isFinite(Number(savedSize[1]))) {
        win.size = [Math.max(win.minimumSize.width, Number(savedSize[0])), Math.max(win.minimumSize.height, Number(savedSize[1]))];
    }
    resizeColumns();
    updateEditorHint();
    compilerInfo();
    try { refreshLibrary(); } catch (ignored) {}
    win.center(); win.show();
}(LaTeX2InDCore));
