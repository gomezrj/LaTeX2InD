# LaTeX2InD — unified Mac/Windows script

**LaTeX2InD** is a script that provides LaTeX support in Adobe InDesign.

## Installation

1. A local TeX distribution is required: MacTeX/BasicTeX or MiKTeX on Mac; TeX Live or MiKTeX on Windows. The script does not install software. Required LaTeX packages are `standalone`, `amsmath`, `amssymb`, `amsfonts`, `varwidth`, and `fix-cm`, plus anything used by your macros.
2. In InDesign, open **Window > Utilities > Scripts**. Reveal the **User** scripts folder in Finder/Explorer and copy `LaTeX2InD.jsx` into it.
3. Save an InDesign document. Double-click the script in the Scripts panel.

## Quick example

On Windows, compilation uses PowerShell. VBScript is used only to hide its window when available; a batch-file fallback handles systems without VBScript and may briefly show a console. On macOS, InDesign launches the job through AppleScript and `/bin/sh`. Operating-system restrictions on process launching still apply.

1. Enter `E = mc^2`, leave **Inline math** and **Place on page** selected, and click **Create**.
2. For inline placement, put a text cursor in a text frame, select **Inline at cursor**, and click **Create**. **From text** copies the insertion point's font size. Type the formula without `$...$` or `\(...\)` delimiters in Inline/Display math modes.

## Project files

On a specific project, creating adding new equations creates an `equations` folder, and the project structure becomes the following.

```text
Project.indd
equations/
  energy.pdf                      <- linked, easily accessible PDF
  auxiliary/
    macros.tex                    <- optional alternative macros location
    record-energy/
      record.xml                  <- source, compiler, size, mode, measurements
      equation.tex                <- generated, compilable LaTeX document
      macros.tex                  <- macro snapshot for this equation
    last-error/                   <- only the latest compilation failure, if any
      equation.tex
      macros.tex
      equation.log
```

The script manages the auxiliary files; normal use does not require opening them. Source in `record.xml` is authoritative for the editor. `equation.tex` is a generated archive; editing it externally does not update the saved editor source. Builds run in the operating system's temporary directory, under `LaTeX2InD/`.

Use **Information > Add macros** to choose a `.tex` file and copy it into the project. The script uses `equations/auxiliary/macros.tex`, or replaces `equations/macros.tex` if that legacy location already exists. Replacing existing project macros requires confirmation. The original chosen file stays untouched. New and modified equations use the imported macros; existing PDFs are not automatically recompiled. Information labels identify the compiler location, loaded equation, and current status.

Keep the **entire equations folder** when moving or sharing the project. InDesign's Package feature may collect linked PDFs without these auxiliary source files. Documents saved in the same directory share the same equations library, as with the old script.

Successful jobs are cleaned automatically: duplicate PDFs, compiler launchers, logs, measurements, intermediate files and backups are removed. **Show last job** opens the saved equation folder after success, the active build while compiling, or `last-error` after a compilation failure. Only the latest failure's source, macros and one log are kept there.

Opening or refreshing the library, or starting a compilation, also prunes recognized older successful jobs once their current PDF and complete equation record exist. Jobs younger than one minute, unfinished/unverifiable jobs, recovery-marked jobs, folders containing unknown files, and symlinks are left alone. Cleanup never removes published PDFs or per-equation records. If files are locked, a later Refresh can retry cleanup.

The three per-equation files remain necessary for the current format: `.tex` is the compilable archive, `record.xml` provides the editor source/style and baseline measurements, and `macros.tex` makes the archive recompilable when project macros change or disappear. Deleting everything but `.tex` would break these features.

## Placement and editing

- **LaTeX block** does not add math delimiters automatically: for example, enter `\[ E = mc^2 \]` and choose **Place on page** (or **Above line at cursor**). Bare `E = mc^2` fails in block mode because `^` requires math mode. Supply a document fragment, not a complete document with `\documentclass` or `\begin{document}`.
- **Inline math** uses text-style mathematics; **Display math** uses display-style mathematics. Both accept a formula body without outer delimiters. **LaTeX block** accepts existing delimited math, aligned environments inside math delimiters, or mixed LaTeX content.
- **Place on page** creates a free-standing linked frame near the page's upper-left corner. **Inline at cursor** inserts a single anchored object. **Above line at cursor** inserts a centered above-line object; it does not create or number a separate paragraph.
- The original **Text wrap** options are available for page/above-line placement, with top/left/bottom/right margins. Enter units explicitly (for example `2 mm`); bare numbers mean points. Inline objects use no text wrap. Editing an existing equation preserves its frame's wrap settings.
- The editor and controls use a 60/40 split when resized. New equation and Project equations each have their own Placement selector.
- Use **Project equations > Place** to reuse an asset without recompiling. Inline reuse requires an equation previously compiled in Inline math mode, with saved measurements.
- Select a PDF frame or its graphic and click **Load selected** to edit it; the project selector also switches to that equation. Alternatively, choose a library entry and **Load Tex**.
- Modify and Make independent inherit the equation’s saved display style; the New equation display-style selector does not change existing equations.
- **Modify** changes the existing PDF and refreshes all matching links in the active document. Other documents sharing that PDF see a changed external link and need their links updated separately.
- **Make independent** creates a new PDF/source record and relinks only the occurrence loaded with **Load selected**. Enter a new name in **Make independent to:** first. Use up to 64 letters (A–Z), numbers, hyphens or underscores. Blank, invalid or already-used names are rejected; this action never chooses a numeric suffix automatically. This action uses the loaded occurrence, not a newly selected object. After it succeeds, the independent equation is automatically loaded into the editor and selected in the project list.
- Updates retain the frame/anchor, existing graphic scale, and manual baseline correction. Frames are fitted to the new content; free-standing frames retain their previous top-left position. Check transformed or specially cropped legacy frames during your trial.
- To name a fresh equation, enter **Name** and use **Create**. The field starts blank; leaving it blank uses `equation`, then `equation_2`, `equation_3`, and so on as needed to avoid existing names. Renaming the Name field does not rename the shared file during an update.

Inline alignment uses TeX's measured box depth, the PDF crop padding, and the placed graphic's scale. TeX points are converted to InDesign/PDF points. The script adjusts the anchor character's baseline shift and preserves subsequent manual corrections on update. PDFs use a fixed 0.5-point border and are placed using their media box.

Tall formulas still need suitable leading: fixed leading or a baseline grid can cause overlap. The script does not alter paragraph leading or typography automatically. It also does not match the surrounding font family or color. Inline formulas remain indivisible objects; InDesign cannot break one formula across lines. An equation with inline occurrences must stay in Inline math mode when updated.

## Failure handling and compatibility

Compilation runs in a unique job folder without blocking InDesign's UI. The script publishes only after the compiler exits successfully and returns valid measurements. A failed publication attempts to restore the previous files from job backups. Failed compilation preserves editor contents and the previous PDF.

Do not edit the destination story while an inline insertion is compiling: a detected text change cancels publication so the equation is not inserted at a stale character offset. Closing or moving the destination document also prevents publication. **Discard pending result** stops watching the job; it does not terminate the external compiler, whose output stays isolated. Cleanup waits for the completion marker before deleting a discarded job, checking in the background for up to ten minutes. If it finishes later or InDesign closes, the next library refresh can clean it. Jobs time out after two minutes with the same behavior.

Placement/update operations are grouped for InDesign Undo. **Undo does not revert external PDF/source files.** For a shared update, recompile the earlier source to revert the PDF; successful-update backups are now deleted to save space. Backups remain only when publication or placement fails and recovery may be necessary. A placement failure after successful publication can leave a valid equation in the library, available for placement again.

Legacy PDFs can be reused. Legacy `.tex` files beside their PDFs are imported by extracting their document body and font size, using LaTeX block mode. The old files are not deleted. Custom preamble changes outside the old script's generated template should be moved into project macros. If the old script deleted the source, the PDF alone cannot recover the original LaTeX.

Mixed-text scanning/conversion, automatic compilation while typing, bulk style updates, equation numbering, and dockable panels are intentionally deferred.
