import React, { useState } from 'react';
import type { Book } from '../types/book';
import { X, Edit2, Trash2, Save, Calendar, Building, BookOpen, Hash, FileText } from 'lucide-react';
import { formatIsbn } from '../utils/isbn';

interface BookDetailModalProps {
  book: Book | null;
  onClose: () => void;
  onUpdate: (updated: Book) => void;
  onDelete: (id: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  onClose,
  onUpdate,
  onDelete,
}) => {
  if (!book) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [authorsStr, setAuthorsStr] = useState(book.authors.join(', '));
  const [publisher, setPublisher] = useState(book.publisher || '');
  const [publishedDate, setPublishedDate] = useState(book.publishedDate || '');
  const [notes, setNotes] = useState(book.notes || '');

  const handleSave = () => {
    const updated: Book = {
      ...book,
      title: title.trim() || 'Bez názvu',
      authors: authorsStr.split(',').map((a) => a.trim()).filter(Boolean),
      publisher: publisher.trim(),
      publishedDate: publishedDate.trim(),
      notes: notes.trim(),
    };
    onUpdate(updated);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Opravdu chcete smazat knihu "${book.title}"?`)) {
      onDelete(book.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Detail knihy
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Cover & Basic Info Header */}
          <div className="flex gap-4 items-start">
            <div className="w-24 h-36 flex-shrink-0 bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 shadow-sm flex items-center justify-center">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <BookOpen className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {!isEditing ? (
                <>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-1">
                    {book.title}
                  </h3>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                    {book.authors.join(', ')}
                  </p>
                  <div className="inline-flex items-center space-x-1 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatIsbn(book.isbn)}</span>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Název knihy</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full text-sm font-semibold p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Autoři (oddělení čárkou)</label>
                    <input
                      type="text"
                      value={authorsStr}
                      onChange={(e) => setAuthorsStr(e.target.value)}
                      className="w-full text-xs font-medium p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Details / Edit Form */}
          {!isEditing ? (
            <div className="space-y-3 text-xs border-t border-slate-100 dark:border-slate-700/60 pt-4">
              {book.publisher && (
                <div className="flex items-center text-slate-600 dark:text-slate-300">
                  <Building className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0" />
                  <span>Nakladatelství: <strong className="text-slate-800 dark:text-slate-100">{book.publisher}</strong></span>
                </div>
              )}
              {book.publishedDate && (
                <div className="flex items-center text-slate-600 dark:text-slate-300">
                  <Calendar className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0" />
                  <span>Rok / Datum vydání: <strong className="text-slate-800 dark:text-slate-100">{book.publishedDate}</strong></span>
                </div>
              )}
              {book.description && (
                <div className="bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                  <p className="text-slate-600 dark:text-slate-300 line-clamp-4">{book.description}</p>
                </div>
              )}
              {book.notes && (
                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 text-amber-900 dark:text-amber-200">
                  <span className="font-semibold block mb-1">Poznámka knihovníka:</span>
                  <p>{book.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 border-t border-slate-100 dark:border-slate-700/60 pt-4 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Nakladatelství</label>
                <input
                  type="text"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Rok / datum vydání</label>
                <input
                  type="text"
                  value={publishedDate}
                  onChange={(e) => setPublishedDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 flex items-center">
                  <FileText className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Poznámka knihovníka
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Např. Státní knihovna, regál B-4, poškozený hřbet..."
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl font-medium text-xs flex items-center space-x-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Smazat</span>
          </button>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-medium text-xs flex items-center space-x-1.5 hover:opacity-90 transition-opacity"
            >
              <Edit2 className="w-4 h-4" />
              <span>Upravit</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-2 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-200/60 transition-colors"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium text-xs flex items-center space-x-1.5 hover:bg-indigo-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Uložit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
