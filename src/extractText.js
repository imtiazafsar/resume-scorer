import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Point to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

export async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  if (ext === 'pdf') {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return text;
  }

  if (ext === 'doc' || ext === 'docx') {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  throw new Error('Unsupported file format. Please use PDF, DOC, DOCX, or TXT.');
}
