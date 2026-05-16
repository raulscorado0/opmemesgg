import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  Mic, 
  LogOut, 
  Plus, 
  Search, 
  Heart, 
  Loader2,
  X,
  User as UserIcon,
  Lock,
  Image as ImageIcon,
  Upload,
  StopCircle,
  Trash2,
  Play,
  Pause,
  Flag,
  Zap,
  Trophy,
  ArrowBigUp,
  ArrowBigDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// --- Types ---
export interface Meme {
  id: string;
  title: string;
  author: string;
  postedBy: string;
  postedById: string;
  postedAt: string;
  tags: string[];
  description: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'audio';
  score: number;
  userVote?: number; // 1, -1 or null
  views: number;
  reports: number;
  badge_text?: string;
  badge_color?: string;
  userTotalScore?: number;
  userTotalViews?: number;
  userMemeCount?: number;
  userVotesGiven?: number;
}

export interface User {
  username: string;
  id: string;
  role: 'agent' | 'admin';
  badge_text?: string;
  badge_color?: string;
  totalScore?: number;
  totalViews?: number;
  memeCount?: number;
  votesGiven?: number;
}

// --- Tutorial Data ---
const TUTORIAL_STEPS = [
  { title: 'BEM-VINDO AO OPMGG', content: 'Esta é uma plataforma para compartilhar e descobrir memes. Aqui você pode navegar pelas últimas tendências.' },
  { title: 'COMO POSTAR', content: 'Clique no botão "POSTAR" no topo. Suportamos imagens, vídeos e áudios enviados da sua galeria ou gravados na hora.' },
  { title: 'VOTAÇÃO E RANKING', content: 'Use as setas para votar. Memes com boa pontuação sobem para a aba "Trending" e ganham mais destaque.' },
  { title: 'SISTEMA DE TÍTULOS', content: 'Usuários ativos ganham títulos automáticos baseados em seus memes, visualizações e pontuação total. Confira os requisitos no seu perfil!' }
];

// --- Form Schemas ---
const loginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres').regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e underscores'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const memeSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  author: z.string().min(1, 'Autor é obrigatório'),
  tags: z.string(),
  description: z.string().optional(),
  fileUrl: z.string().optional(),
  fileType: z.enum(['image', 'video', 'audio']),
});

// --- Helper for API Calls ---
const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem('opmgg_token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const response = await fetch(url, { 
    ...options, 
    headers, 
    credentials: 'include' 
  });

  return response;
};

// --- Components ---

interface MemeCardProps {
  meme: Meme;
  user: User | null;
  rewardRules: RewardRule[];
  onAuthRequired: () => void;
  onUpdate: () => void | Promise<void>;
  onOpenDetails: (meme: Meme) => void;
  onProfileSelect: (userId: string | null) => void;
}

export interface RewardRule {
  id: string;
  metric: 'memes' | 'views' | 'score' | 'votes' | 'engagement';
  operator: '>' | '=' | '<' | '>=' | '<=';
  value: number;
  title_text: string;
  title_color: string;
}

const getFameBadges = (meme: Meme, rules: RewardRule[]) => {
  const score = meme.userTotalScore || 0;
  const views = meme.userTotalViews || 0;
  const count = meme.userMemeCount || 0;
  const votes = meme.userVotesGiven || 0;
  const engagement = count > 0 ? (views / count) : 0;

  const badges: { text: string; color: string }[] = [];

  rules.forEach(rule => {
    let metricValue = 0;
    if (rule.metric === 'memes') metricValue = count;
    else if (rule.metric === 'views') metricValue = views;
    else if (rule.metric === 'score') metricValue = score;
    else if (rule.metric === 'votes') metricValue = votes;
    else if (rule.metric === 'engagement') metricValue = engagement;

    let match = false;
    if (rule.operator === '>') match = metricValue > rule.value;
    else if (rule.operator === '>=') match = metricValue >= rule.value;
    else if (rule.operator === '=') match = metricValue === rule.value;
    else if (rule.operator === '<') match = metricValue < rule.value;
    else if (rule.operator === '<=') match = metricValue <= rule.value;

    if (match) {
      badges.push({ text: rule.title_text, color: rule.title_color });
    }
  });

  return badges;
};

const MemeCard: React.FC<MemeCardProps> = ({ meme, user, rewardRules, onAuthRequired, onUpdate, onOpenDetails, onProfileSelect }) => {
  const [isVoting, setIsVoting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Record view in the background
    const recordView = async () => {
      try {
        await fetch(`/api/memes/${meme.id}/view`, { method: 'POST' });
      } catch (err) {}
    };
    const timer = setTimeout(recordView, 2000); // Record view after 2 seconds on screen
    return () => clearTimeout(timer);
  }, [meme.id]);

  const handleVote = async (value: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onAuthRequired();
      return;
    }
    if (isVoting) return;
    setIsVoting(true);
    try {
      const res = await apiFetch(`/api/memes/${meme.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (res.ok) {
        onUpdate();
      }
    } catch (err) {
      console.error('Vote failed', err);
    } finally {
      setIsVoting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir esta publicação?')) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/memes/${meme.id}`, { method: 'DELETE' });
      if (res.ok) {
        onUpdate();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao deletar');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao deletar');
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = user && (user.id === meme.postedById || user.role === 'admin');

  return (
    <motion.div 
      layout 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      onClick={() => onOpenDetails(meme)}
      className="group bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden hover:border-green-500/50 transition-all relative break-inside-avoid shadow-xl shadow-black/40 cursor-pointer"
    >
      <div className="relative overflow-hidden">
        {meme.fileType === 'image' ? (
          <img 
            src={meme.fileUrl} 
            alt={meme.title} 
            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" 
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/600x400/18181b/52525b?text=Meme+Indispon%C3%ADvel';
            }}
          />
        ) : meme.fileType === 'audio' ? (
          <div className="h-48 bg-zinc-950 flex flex-col items-center justify-center gap-4 border-b border-zinc-800">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
              <Mic className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Arquivo de Áudio</p>
          </div>
        ) : (
          <video src={meme.fileUrl} className="w-full" controls={false} />
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {meme.tags.map(tag => (
              <span key={tag} className="text-[10px] bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full font-bold text-white shadow-sm">#{tag}</span>
            ))}
          </div>
        </div>

        {canDelete && (
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="absolute top-4 right-4 p-2.5 bg-black/70 backdrop-blur-md text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all z-10 disabled:opacity-50 shadow-xl border border-white/5 active:scale-95"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold italic uppercase leading-tight text-sm sm:text-base group-hover:text-green-500 transition-colors line-clamp-2 tracking-tight font-display">{meme.title}</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider opacity-60">Origem: {meme.author}</p>
              <div className="w-1 h-1 bg-zinc-800 rounded-full" />
              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider opacity-60">{meme.views} visualizações</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5 shrink-0 bg-zinc-950/50 p-1.5 rounded-xl border border-zinc-800/50">
            <button 
              onClick={(e) => handleVote(1, e)} 
              disabled={isVoting} 
              className={`p-0.5 rounded-lg transition-all ${meme.userVote === 1 ? 'text-green-500 bg-green-500/10' : 'text-zinc-600 hover:text-green-400'}`}
            >
              <ArrowBigUp className={`w-5 h-5 ${meme.userVote === 1 ? 'fill-current' : ''}`} />
            </button>
            <span className={`text-[10px] font-black min-w-[16px] text-center ${meme.score > 0 ? 'text-green-500' : meme.score < 0 ? 'text-red-500' : 'text-zinc-400'}`}>
              {meme.score}
            </span>
            <button 
              onClick={(e) => handleVote(-1, e)} 
              disabled={isVoting} 
              className={`p-0.5 rounded-lg transition-all ${meme.userVote === -1 ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 hover:text-red-400'}`}
            >
              <ArrowBigDown className={`w-5 h-5 ${meme.userVote === -1 ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              onClick={(e) => { e.stopPropagation(); onProfileSelect(meme.postedById); }}
              className="w-7 h-7 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5 text-green-500" />
            </div>
            <div className="flex flex-col">
              <p className="text-[10px] text-zinc-300 font-bold uppercase flex items-center flex-wrap gap-1.5">
                <span onClick={(e) => { e.stopPropagation(); onProfileSelect(meme.postedById); }} className="hover:text-green-500 transition-colors cursor-pointer">{meme.postedBy}</span>
                {meme.badge_text && (
                  <span className={`px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase text-black ring-1 ring-white/10 shrink-0`} style={{ backgroundColor: meme.badge_color || '#22c55e' }}>
                    {meme.badge_text}
                  </span>
                )}
                {getFameBadges(meme, rewardRules).map((badge, idx) => (
                  <motion.span 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={idx}
                    className="px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase border bg-zinc-950 shrink-0 shadow-sm transition-all hover:scale-110 cursor-default"
                    style={{ borderColor: badge.color + '40', color: badge.color, boxShadow: `0 0 10px ${badge.color}10` }}
                  >
                    {badge.text}
                  </motion.span>
                ))}
                {user?.role === 'admin' && meme.postedById === user.id && <span className="bg-green-500 text-black px-1 rounded-[2px] text-[8px] font-black italic">OP</span>}
              </p>
              <p className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(meme.postedAt).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AuthModal({ mode, setMode, setError, onSuccess, onClose }: { mode: 'login' | 'register', setMode: (m: 'login' | 'register') => void, setError: (e: string | null) => void, onSuccess: (u: User) => void, onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(mode === 'login' ? loginSchema : registerSchema)
  });

  const onSubmit = async (data: any) => {
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      
      const resData = await res.json().catch(() => ({}));
      
      if (res.ok) {
        if (resData.token) localStorage.setItem('opmgg_token', resData.token);
        onSuccess(resData);
      } else {
        if (res.status === 404) {
          setError('Backend não encontrado. Se você publicou no Netlify, saiba que esta aplicação requer um servidor Node.js (Full-Stack) para funcionar.');
        } else {
          setError(resData.error || 'Ocorreu um erro ao processar a solicitação.');
        }
      }
    } catch (err: any) {
      setError('Erro de conexão. Verifique se o servidor backend está rodando.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-zinc-900 w-full sm:max-w-sm p-6 sm:p-8 rounded-t-3xl sm:rounded-[2rem] border-x border-t sm:border border-zinc-800 shadow-2xl relative mt-auto sm:my-auto outline-none">
        <button onClick={onClose} className="absolute right-4 sm:right-6 top-4 sm:top-6 p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="bg-green-500 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShieldAlert className="w-7 h-7 text-black" />
          </div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter font-display">
            {mode === 'login' ? 'Entrar' : 'Criar Conta'}
          </h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input {...register('username')} placeholder="Nome de Usuário" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3.5 outline-none focus:ring-2 ring-green-500/50 transition-all" />
            </div>
            {errors.username && <p className="text-xs text-red-500 mt-1 ml-4">{(errors.username as any).message}</p>}
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input {...register('password')} type="password" placeholder="Sua Senha" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3.5 outline-none focus:ring-2 ring-green-500/50 transition-all" />
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1 ml-4">{(errors.password as any).message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95">
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : mode === 'login' ? 'ENTRAR' : 'CONTINUAR'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="text-sm font-bold text-zinc-500 hover:text-green-500 transition-colors">
            {mode === 'login' ? 'Ainda não tem conta? Crie uma agora' : 'Já tem uma conta? Faça o login'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PostModal({ onClose, user, setError, onSuccess }: { onClose: () => void, user: User | null, setError: (e: string | null) => void, onSuccess: () => void }) {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(memeSchema),
    defaultValues: { fileType: 'image' as const, fileUrl: '', title: '', author: '', tags: '', description: '' }
  });

  const fileType = watch('fileType');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setValue('fileType', 'audio');
        setIsRecording(false);
      };

      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setIsRecording(true);
    } catch (err) {
      setError('Erro ao acessar microfone.');
    }
  };

  const stopRecording = () => {
    recorder?.stop();
    recorder?.stream.getTracks().forEach(track => track.stop());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Auto-detect type
      if (file.type.startsWith('image/')) setValue('fileType', 'image');
      else if (file.type.startsWith('video/')) setValue('fileType', 'video');
      else if (file.type.startsWith('audio/')) setValue('fileType', 'audio');
    }
  };

  const onSubmit = async (data: any) => {
    try {
      let finalFileUrl = data.fileUrl;

      // Handle file upload if present
      if (selectedFile || audioBlob) {
        const formData = new FormData();
        formData.append('file', selectedFile || audioBlob!);
        
        const uploadRes = await apiFetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || 'Erro no upload');
        }
        
        const uploadData = await uploadRes.json();
        finalFileUrl = uploadData.fileUrl;
      }

      if (!finalFileUrl) {
        setError('Por favor, informe uma URL ou selecione um arquivo.');
        return;
      }

      const res = await apiFetch('/api/memes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, fileUrl: finalFileUrl }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Erro ao publicar.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar conteúdo.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-zinc-900 w-full sm:max-w-xl p-6 sm:p-10 rounded-t-[2.5rem] sm:rounded-[3rem] border-x border-t sm:border border-zinc-800 shadow-2xl relative mt-auto sm:my-auto max-h-[92vh] flex flex-col outline-none">
        <button onClick={onClose} className="absolute right-4 sm:right-8 top-4 sm:top-8 p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors z-10">
          <X className="w-6 h-6" />
        </button>

        <div className="mb-4 sm:mb-8 shrink-0">
          <h2 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter font-display">NOVA POSTAGEM</h2>
          <p className="text-zinc-500 text-[10px] sm:text-sm mt-1 uppercase font-bold tracking-widest opacity-60">Status: AGUARDANDO ENVIO</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 overflow-y-auto no-scrollbar pr-1 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase text-zinc-500 ml-4 mb-2 block">Título</label>
              <input {...register('title')} placeholder="O que está acontecendo?" className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 transition-all font-bold" />
              {errors.title && <p className="text-xs text-red-500 mt-1 ml-4">{errors.title.message as string}</p>}
            </div>

            <div className="md:col-span-1">
              <label className="text-[10px] font-bold uppercase text-zinc-500 ml-4 mb-2 block">Autor</label>
              <input {...register('author')} placeholder="Quem criou?" className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 transition-all font-bold" />
              {errors.author && <p className="text-xs text-red-500 mt-1 ml-4">{errors.author.message as string}</p>}
            </div>

            <div className="md:col-span-1">
              <label className="text-[10px] font-bold uppercase text-zinc-500 ml-4 mb-2 block">Tipo</label>
              <select {...register('fileType')} className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 appearance-none text-zinc-400 font-bold">
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="audio">Áudio</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-zinc-500 ml-4 mb-2 block">Tags</label>
            <input {...register('tags')} placeholder="engraçado, momento, gamer" className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 transition-all font-bold" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-zinc-500 ml-4 mb-2 block">Descrição Adicional</label>
            <textarea {...register('description')} placeholder="Conte um pouco mais sobre essa publicação..." className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 transition-all font-bold resize-none" rows={3} />
          </div>

          <div className="space-y-4">
            <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-2xl">
              <button type="button" onClick={() => { setSelectedFile(null); setAudioUrl(null); setAudioBlob(null); }} className={`flex-1 py-3 rounded-xl transition-all text-[10px] font-bold uppercase flex items-center justify-center gap-2 ${!selectedFile && !audioUrl ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
                <ImageIcon className="w-4 h-4" /> URL
              </button>
              <label className={`flex-1 py-3 rounded-xl transition-all text-[10px] font-bold uppercase flex items-center justify-center gap-2 cursor-pointer ${selectedFile ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
                <Upload className="w-4 h-4" /> Arquivo
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*,audio/*" />
              </label>
              {fileType === 'audio' && (
                <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`flex-1 py-3 rounded-xl transition-all text-[10px] font-bold uppercase flex items-center justify-center gap-2 ${isRecording ? 'bg-red-500 text-white animate-pulse' : audioUrl ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
                  {isRecording ? <StopCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {isRecording ? 'Parar' : audioUrl ? 'Gravado' : 'Gravar'}
                </button>
              )}
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500/10 p-2 rounded-lg"><Upload className="w-4 h-4 text-green-500" /></div>
                  <span className="text-xs font-medium text-zinc-300 truncate max-w-[200px]">{selectedFile.name}</span>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}

            {audioUrl && (
              <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/10 p-2 rounded-lg"><Play className="w-4 h-4 text-red-500" /></div>
                  <span className="text-xs font-medium text-zinc-300">Áudio Gravado</span>
                </div>
                <button type="button" onClick={() => { setAudioUrl(null); setAudioBlob(null); }} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}

            {!selectedFile && !audioUrl && (
              <div className="relative">
                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input {...register('fileUrl')} placeholder="URL do Arquivo (Imgur, etc)" className="w-full bg-zinc-950 border border-zinc-800 pl-11 pr-4 py-4 rounded-2xl outline-none focus:ring-2 ring-green-500/50 font-bold" />
              </div>
            )}
            {errors.fileUrl && !selectedFile && !audioUrl && <p className="text-xs text-red-500 mt-1 ml-4">{errors.fileUrl.message as string}</p>}
          </div>

          <div className="pt-2 sm:pt-4">
            <button disabled={isSubmitting || isRecording} className="w-full bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-xl shadow-green-900/20 text-base sm:text-lg uppercase tracking-widest italic">
              {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'TRANSMITIR CONTEÚDO'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'trending'>('recent');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [selectedMeme, setSelectedMeme] = useState<Meme | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [reportingMeme, setReportingMeme] = useState<Meme | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
    fetchMemes().then((fetchedMemes) => {
      const params = new URLSearchParams(window.location.search);
      const memeId = params.get('meme');
      if (memeId && fetchedMemes) {
        const meme = (fetchedMemes as Meme[]).find(m => m.id === memeId);
        if (meme) setSelectedMeme(meme);
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem('opmgg_token');
      }
    } catch (err) {
      console.error('Session check failed', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemes = async () => {
    try {
      const url = new URL('/api/memes', window.location.origin);
      url.searchParams.append('sort', sortBy);
      if (selectedTag) url.searchParams.append('tag', selectedTag);
      if (selectedProfileId) url.searchParams.append('userId', selectedProfileId);
      
      const res = await apiFetch(url.pathname + url.search);
      if (res.status === 404) {
        setError('Servidor backend não encontrado em ' + window.location.origin + '. Esta aplicação requer um servidor Node.js operando para fornecer os dados.');
        setMemes([]);
        return [];
      }
      const data = await res.json().catch(() => ({ error: 'Dados inválidos do servidor' }));
      if (Array.isArray(data)) {
        setMemes(data);
        return data;
      } else {
        console.error('Fetch memes failed: expected array, got', data);
        setMemes([]);
        if (data.error) setError(data.error);
        return [];
      }
    } catch (err) {
      console.error('Fetch memes failed', err);
      setMemes([]);
      return [];
    }
  };

  const searchUsers = async (query: string) => {
    if (!query) {
      setUserSearchResults([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setUserSearchResults(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    searchUsers(searchTerm);
  }, [debouncedSearch]);

  const fetchAdminReports = async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await apiFetch('/api/admin/reports');
      if (res.ok) {
        const data = await res.json();
        setAdminReports(data);
      }
    } catch (err) {}
  };

  const fetchAdminUsers = async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data);
      }
    } catch (err) {}
  };

  const handleUpdateBadge = async (userId: string, badgeText: string, badgeColor: string) => {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/badge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge_text: badgeText, badge_color: badgeColor })
      });
      if (res.ok) {
        fetchAdminUsers();
        fetchMemes(); // Refresh badges in feed
      }
    } catch (err) {}
  };

  const fetchRewardRules = async () => {
    try {
      const res = await apiFetch('/api/admin/reward-rules');
      if (res.ok) {
        const data = await res.json();
        setRewardRules(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (isAdminPanelOpen) {
      fetchAdminReports();
      fetchAdminUsers();
      fetchRewardRules();
    }
  }, [isAdminPanelOpen]);

  useEffect(() => {
    fetchMemes();
  }, [sortBy, selectedTag, selectedProfileId]);

  const tagCloud = useMemo(() => {
    const counts: Record<string, number> = {};
    memes.forEach(m => {
      m.tags.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    const entries = Object.entries(counts).map(([tag, count]) => ({ tag, count }));
    if (entries.length === 0) return [];
    
    const maxCount = Math.max(...entries.map(e => e.count), 1);
    const minCount = Math.min(...entries.map(e => e.count), 1);
    
    return entries.map(e => ({
      tag: e.tag,
      count: e.count,
      // Font size multiplier from 0.75 to 1.75
      size: maxCount === minCount ? 1 : 0.75 + ((e.count - minCount) / (maxCount - minCount)) * 1.0
    })).sort((a, b) => b.count - a.count).slice(0, 25);
  }, [memes]);

  const filteredMemes = useMemo(() => {
    return memes.filter(m => 
      m.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(debouncedSearch.toLowerCase()))
    );
  }, [memes, debouncedSearch]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    localStorage.removeItem('opmgg_token');
    setUser(null);
    setIsAdminPanelOpen(false);
  };

  const handleReport = async () => {
    if (!reportingMeme) return;
    
    try {
      const res = await apiFetch(`/api/memes/${reportingMeme.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reportReason.trim() })
      });
      if (res.ok) {
        alert('Seu reporte foi enviado para análise. Obrigado!');
        setReportingMeme(null);
        setReportReason('');
      } else {
        const d = await res.json();
        alert(d.error || 'Erro ao reportar');
      }
    } catch (err) {
      console.error('Report failed', err);
    }
  };

  const handleResolveReport = async (reportId: string, action: 'dismiss' | 'delete_meme') => {
    try {
      const res = await apiFetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        fetchAdminReports();
        fetchMemes();
      }
    } catch (err) {}
  };

  const handleDeleteMeme = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta publicação?')) return;
    try {
      const res = await apiFetch(`/api/memes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchMemes();
        setSelectedMeme(null);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao deletar publicação');
      }
    } catch (err) {
      setError('Erro de conexão ao tentar deletar');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <Loader2 className="w-12 h-12 text-green-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-green-500/30">
      <AnimatePresence>
        {isAuthOpen && (
          <AuthModal 
            mode={authMode} 
            setMode={setAuthMode} 
            setError={setError}
            onSuccess={(u) => {
              setUser(u);
              setIsAuthOpen(false);
              setError(null);
            }}
            onClose={() => {
              setIsAuthOpen(false);
              setError(null);
            }}
          />
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3 sm:gap-4 select-none">
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-green-500 p-1 rounded-lg shadow-lg shadow-green-900/20">
              <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            </div>
            <h1 className="text-base sm:text-xl font-black italic uppercase tracking-tighter hidden xs:block font-display cursor-pointer" onClick={() => {
              setSelectedProfileId(null);
              setSelectedTag('');
              setSearchTerm('');
              setIsAdminPanelOpen(false);
            }}>OPMGG</h1>
          </div>

          <div className="flex-1 max-w-sm relative">
            <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Buscar memes ou pessoas..." 
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 sm:pl-11 pr-4 sm:pr-6 py-2 sm:py-2.5 outline-none focus:ring-2 ring-green-500/40 transition-all text-xs sm:text-sm font-medium placeholder:text-zinc-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {userSearchResults.length > 0 && (
              <div className="absolute top-full mt-2 left-0 w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                <p className="px-4 py-2 text-[8px] font-black text-zinc-600 uppercase border-b border-zinc-800">USUÁRIOS ENCONTRADOS</p>
                {userSearchResults.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => {
                      setSelectedProfileId(u.id);
                      setSearchTerm('');
                      setUserSearchResults([]);
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700">
                      <UserIcon className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-white flex items-center flex-wrap gap-2">
                        {u.username}
                        {u.badge_text && (
                          <span className="px-1 py-0.5 rounded-[3px] text-[6px] font-black uppercase text-black" style={{ backgroundColor: u.badge_color || '#22c55e' }}>
                            {u.badge_text}
                          </span>
                        )}
                        {/* Note: search results don't have enough info for fame badge directly, but we can add it later if needed */}
                      </p>
                      <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Perfil do Usuário</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user ? (
              <>
                <button 
                  onClick={() => setIsPosting(true)}
                  className="bg-green-600 hover:bg-green-500 text-white p-2 sm:px-5 sm:py-2.5 rounded-full font-black text-[10px] sm:text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-green-900/10"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline italic">POSTAR</span>
                </button>
                
                <div className="flex items-center gap-1 sm:gap-2 border-l border-zinc-800 pl-2 sm:pl-4 text-zinc-500">
                  {user.role === 'admin' && (
                    <button 
                      onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all font-black text-[10px] uppercase tracking-tighter ${isAdminPanelOpen ? 'bg-red-500 text-white shadow-lg shadow-red-900/20' : 'bg-zinc-800 text-zinc-400 hover:text-green-500'}`}
                      title={isAdminPanelOpen ? 'Fechar Painel ADM' : 'Painel ADM'}
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span className="hidden md:inline">Painel ADM</span>
                    </button>
                  )}
                  <button 
                    onClick={handleLogout}
                    className="p-2 hover:bg-zinc-800 rounded-full hover:text-red-400 transition-colors"
                    title="Sair"
                  >
                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </>
            ) : (
              <button 
                onClick={() => setIsAuthOpen(true)}
                className="bg-white text-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-black text-[10px] sm:text-xs hover:bg-zinc-200 transition-all active:scale-95 italic"
              >
                ENTRAR
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
          {/* Sidebar / Filters */}
          <aside className="w-full lg:w-64 shrink-0 space-y-4 sm:space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 sm:p-5 shadow-xl overflow-hidden">
              <button 
                onClick={() => { setTutorialStep(0); setIsTutorialOpen(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800 transition-all text-zinc-400 hover:text-green-500 group"
              >
                <div className="bg-green-500/10 p-2 rounded-xl group-hover:bg-green-500 group-hover:text-black transition-all">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-tight">Tutorial de Uso</p>
                  <p className="text-[8px] font-medium text-zinc-600 group-hover:text-green-500/60 uppercase">Dicas para Iniciantes</p>
                </div>
              </button>
              
              {selectedProfileId && (
                <button 
                  onClick={() => setSelectedProfileId(null)}
                  className="w-full mt-2 flex items-center gap-3 p-3 rounded-2xl bg-zinc-800 text-red-400 hover:bg-zinc-700 transition-all"
                >
                  <div className="p-2 rounded-xl bg-red-400/10"><X className="w-4 h-4" /></div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-tight">Limpar Filtro de Perfil</p>
                    <p className="text-[8px] font-medium opacity-60 uppercase">Vendo apenas memes de {memes.find(m => m.postedById === selectedProfileId)?.postedBy || 'Usuário'}</p>
                  </div>
                </button>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 sm:p-5 shadow-xl">
              <h4 className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mb-4 px-2">BUSCAR USUÁRIOS</h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-9 pr-4 py-2.5 text-[9px] font-bold uppercase transition-all focus:ring-1 ring-green-500/30 outline-none text-zinc-300"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 sm:p-5 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between mb-4 px-2">
                <h4 className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">ORDENAÇÃO</h4>
                <div className="flex bg-zinc-950 p-1 rounded-xl lg:hidden">
                  {['recent', 'trending'].map(id => (
                    <button 
                      key={id}
                      onClick={() => setSortBy(id as any)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${sortBy === id ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-600'}`}
                    >
                      {id === 'recent' ? 'Recente' : 'Trending'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hidden lg:space-y-1.5 lg:block">
                {[
                  { id: 'recent', label: 'Recentemente Postados' },
                  { id: 'trending', label: 'Mais Votados' }
                ].map(s => (
                  <button 
                    key={s.id}
                    onClick={() => setSortBy(s.id as any)}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-[10px] font-black transition-all uppercase tracking-wider ${sortBy === s.id ? 'bg-green-600 text-white shadow-lg shadow-green-900/40' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 sm:p-6 shadow-xl relative overflow-hidden group">
              <div className="flex items-center justify-between px-2 mb-4 lg:mb-6">
                <div className="flex items-center gap-2">
                  <h4 className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">TAGS POPULARES</h4>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse hidden sm:block" />
                </div>
                {selectedTag && (
                  <button 
                    onClick={() => setSelectedTag(null)} 
                    className="text-[8px] font-black text-red-500 uppercase hover:underline flex items-center gap-1"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="flex flex-row overflow-x-auto lg:flex-wrap items-center lg:justify-center gap-x-4 lg:gap-x-3 gap-y-4 px-1 min-h-[40px] lg:min-h-[120px] no-scrollbar active:cursor-grabbing pb-2 lg:pb-0">
                {tagCloud.map(({ tag, size }) => (
                  <button 
                    key={tag}
                    onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                    style={{ fontSize: `${size * 0.75}rem` }}
                    className={`
                      inline-block font-black transition-all duration-300 uppercase leading-none whitespace-nowrap lg:whitespace-normal shrink-0 lg:shrink
                      ${selectedTag === tag 
                        ? 'text-green-500 scale-110 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:scale-105 active:scale-95'
                      }
                    `}
                  >
                    #{tag}
                  </button>
                ))}
                {tagCloud.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-4 opacity-20 w-full">
                    <Cloud className="w-8 h-8 mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Sem dados</p>
                  </div>
                )}
              </div>
              
              <div className="absolute -bottom-6 -right-6 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none hidden lg:block">
                <Cloud className="w-24 h-24 text-white" />
              </div>
            </div>

            {user?.role === 'admin' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 sm:p-5 shadow-xl overflow-hidden">
                <h4 className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mb-4 px-2">MODERAÇÃO</h4>
                <div className="space-y-4">
                  <button 
                    onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${isAdminPanelOpen ? 'bg-red-500 text-white shadow-xl shadow-red-900/10' : 'bg-zinc-800 text-zinc-400 hover:text-green-500 group'}`}
                  >
                    <div className={`p-2 rounded-xl transition-colors ${isAdminPanelOpen ? 'bg-white/20' : 'bg-zinc-700 group-hover:bg-green-500 group-hover:text-black'}`}>
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-black uppercase tracking-tight">{isAdminPanelOpen ? 'FECHAR PAINEL' : 'PAINEL ADM'}</p>
                      <p className="text-[8px] font-medium opacity-60 uppercase">Gestão de Selos & Denúncias</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {selectedProfileId && (
              <div className="mb-6 flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-2xl px-6 py-3">
                <div className="flex items-center gap-3">
                  <UserIcon className="w-4 h-4 text-green-500" />
                  <p className="text-[10px] font-black uppercase text-green-500 tracking-widest">Visualizando Publicações do Usuário</p>
                </div>
                <button 
                  onClick={() => setSelectedProfileId(null)}
                  className="text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors"
                >
                  Limpar Filtro
                </button>
              </div>
            )}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
                  <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <p className="text-[11px] sm:text-xs font-bold uppercase tracking-tight text-red-200">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors shrink-0"><X className="w-4 h-4 text-red-500" /></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isAdminPanelOpen && user?.role === 'admin' ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 sm:space-y-8 mb-12">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xl sm:text-2xl font-black italic uppercase text-green-500 tracking-tighter font-display">PAINEL DE ADMINISTRAÇÃO</h2>
                  <button onClick={() => setIsAdminPanelOpen(false)} className="text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 self-start">
                    <X className="w-3.5 h-3.5" />
                    FECHAR PAINEL
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 shadow-lg shadow-amber-900/10">
                          <Trophy className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black italic uppercase tracking-tighter">Títulos Automáticos</h3>
                          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest opacity-60">Regras de reconecimento dinâmico</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={async () => {
                          const res = await apiFetch('/api/admin/reward-rules', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              metric: 'score',
                              operator: '>=',
                              value: 10,
                              title_text: 'NOVO TÍTULO',
                              title_color: '#22c55e'
                            })
                          });
                          if (res.ok) fetchRewardRules();
                        }}
                        className="bg-green-500 hover:bg-green-400 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-green-900/20 active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        ADIcionar regra
                      </button>
                    </div>

                    <div className="space-y-4">
                      {rewardRules.map(rule => (
                        <div key={rule.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-6 group hover:border-zinc-700 transition-colors">
                          <div className="flex flex-wrap items-center gap-4">
                             <div className="flex items-center gap-2">
                               <span className="text-[10px] font-black uppercase text-zinc-600">CONDIÇÃO</span>
                               <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
                                 <select 
                                   value={rule.metric} 
                                   onChange={async (e) => {
                                     const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, {
                                       method: 'PATCH',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ ...rule, metric: e.target.value })
                                     });
                                     if (res.ok) fetchRewardRules();
                                   }}
                                   className="bg-transparent px-3 py-2 text-[10px] font-black uppercase text-white outline-none cursor-pointer hover:bg-zinc-800 transition-colors border-r border-zinc-800"
                                 >
                                   <option value="memes">MEMES POSTADOS</option>
                                   <option value="views">TOTAL VIEWS</option>
                                   <option value="score">PONTUAÇÃO</option>
                                   <option value="votes">VOTOS DADOS</option>
                                   <option value="engagement">ENGAJAMENTO (MÉDIO)</option>
                                 </select>
                                 <select 
                                   value={rule.operator}
                                   onChange={async (e) => {
                                     const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, {
                                       method: 'PATCH',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ ...rule, operator: e.target.value })
                                     });
                                     if (res.ok) fetchRewardRules();
                                   }}
                                   className="bg-transparent px-3 py-2 text-[10px] font-black text-white outline-none cursor-pointer hover:bg-zinc-800 transition-colors border-r border-zinc-800"
                                 >
                                   <option value=">">&gt;</option>
                                   <option value=">=">&ge;</option>
                                   <option value="=">=</option>
                                   <option value="<">&lt;</option>
                                   <option value="<=">&le;</option>
                                 </select>
                                 <input 
                                   type="number"
                                   defaultValue={rule.value}
                                   onBlur={async (e) => {
                                     const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, {
                                       method: 'PATCH',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ ...rule, value: parseFloat(e.target.value) })
                                     });
                                     if (res.ok) fetchRewardRules();
                                   }}
                                   className="w-16 bg-transparent px-3 py-2 text-[10px] font-black text-white outline-none focus:bg-zinc-800 transition-colors"
                                 />
                               </div>
                             </div>
                             
                             <div className="flex items-center gap-2">
                               <span className="text-[10px] font-black uppercase text-zinc-600">RESULTADO</span>
                               <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
                                 <input 
                                   placeholder="TEXTO DO TÍTULO"
                                   defaultValue={rule.title_text}
                                   onBlur={async (e) => {
                                     const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, {
                                       method: 'PATCH',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ ...rule, title_text: e.target.value })
                                     });
                                     if (res.ok) fetchRewardRules();
                                   }}
                                   className="bg-transparent px-4 py-2 text-[10px] font-black uppercase text-white outline-none focus:bg-zinc-800 transition-colors border-r border-zinc-800 w-32"
                                 />
                                 <div className="relative group/color px-2">
                                   <input 
                                     type="color"
                                     defaultValue={rule.title_color}
                                     onChange={async (e) => {
                                       const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, {
                                         method: 'PATCH',
                                         headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ ...rule, title_color: e.target.value })
                                       });
                                       if (res.ok) fetchRewardRules();
                                     }}
                                     className="w-8 h-8 bg-transparent border-none cursor-pointer opacity-0 absolute inset-0 z-10"
                                   />
                                   <div className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: rule.title_color }} />
                                 </div>
                               </div>
                             </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="hidden lg:flex flex-col items-end">
                              <span className="text-[7px] font-black uppercase text-zinc-600 tracking-widest mb-1">PRÉVIA DO SELO</span>
                              <span 
                                className="px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase border bg-zinc-950"
                                style={{ borderColor: rule.title_color + '40', color: rule.title_color }}
                              >
                                {rule.title_text}
                              </span>
                            </div>

                            <button 
                              onClick={async () => {
                                const res = await apiFetch(`/api/admin/reward-rules/${rule.id}`, { method: 'DELETE' });
                                if (res.ok) fetchRewardRules();
                              }}
                              className="w-10 h-10 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all flex items-center justify-center group/del shadow-lg shadow-red-900/0 hover:shadow-red-900/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {rewardRules.length === 0 && (
                        <div className="text-center py-12 bg-zinc-950 rounded-2xl border border-zinc-800 border-dashed">
                          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Nenhuma regra de título configurada</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500">
                          <Plus className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black italic uppercase">Gestão Manual de Selos</h3>
                          <p className="text-xs text-zinc-500 font-bold uppercase">Conceder títulos personalizados</p>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                        <input 
                          type="text" 
                          placeholder="Buscar Usuários..." 
                          value={adminSearchTerm}
                          onChange={(e) => setAdminSearchTerm(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:ring-1 ring-green-500/50 w-full sm:w-48"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {adminUsers.filter(u => u.username.toLowerCase().includes(adminSearchTerm.toLowerCase())).length > 0 ? (
                        adminUsers.filter(u => u.username.toLowerCase().includes(adminSearchTerm.toLowerCase())).map(adminUser => (
                          <div key={adminUser.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500">
                                <UserIcon className="w-5 h-5" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <p className="font-bold uppercase text-sm flex items-center gap-2">
                                  {adminUser.username}
                                  <span className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-md text-[7px] font-black">
                                    {adminUser.memeCount || 0} MEMES
                                  </span>
                                </p>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  {adminUser.badge_text ? (
                                    <span className="px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase text-black shrink-0" style={{ backgroundColor: adminUser.badge_color || '#22c55e' }}>
                                      {adminUser.badge_text}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] text-zinc-600 font-bold uppercase">Sem selo manual</span>
                                  )}
                                  <div className="h-2 w-px bg-zinc-800 hidden sm:block" />
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 bg-pink-500/10 px-1.5 py-0.5 rounded-md">
                                      <Zap className="w-2.5 h-2.5 text-pink-500" />
                                      <span className="text-[8px] font-black text-pink-500">{adminUser.totalViews || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                                      <Trophy className="w-2.5 h-2.5 text-amber-500" />
                                      <span className="text-[8px] font-black text-amber-500">{adminUser.totalScore || 0}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                              <input 
                                placeholder="Texto do Selo" 
                                defaultValue={adminUser.badge_text || ''}
                                onBlur={(e) => handleUpdateBadge(adminUser.id, e.target.value, adminUser.badge_color || '#22c55e')}
                                className="flex-1 sm:w-32 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-xl text-[10px] font-bold uppercase outline-none focus:ring-1 ring-green-500/50" 
                              />
                              <input 
                                type="color" 
                                defaultValue={adminUser.badge_color || '#22c55e'}
                                onBlur={(e) => handleUpdateBadge(adminUser.id, adminUser.badge_text || '', e.target.value)}
                                className="w-10 h-10 bg-transparent border-none cursor-pointer" 
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12 bg-zinc-950 rounded-2xl border border-zinc-800 border-dashed">
                          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Nenhum usuário encontrado</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
                        <Flag className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black italic uppercase">Denúncias Pendentes</h3>
                        <p className="text-xs text-zinc-500 font-bold uppercase">Análise de conteúdo reportado</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {adminReports.length > 0 ? adminReports.map((report) => (
                        <div key={report.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Meme Reportado:</p>
                              <h4 className="text-sm font-bold text-white uppercase">{report.memeTitle}</h4>
                            </div>
                            <div className="bg-red-950/30 text-red-400 px-3 py-1 rounded-full text-[8px] font-black uppercase">PENDENTE</div>
                          </div>
                          
                          <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                            <p className="text-[10px] text-zinc-600 font-bold uppercase mb-2">Motivo da Denúncia:</p>
                            <p className="text-xs text-zinc-300 font-medium italic">{report.reason}</p>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <p className="text-[10px] text-zinc-600 font-bold uppercase">Por: {report.reporterName}</p>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleResolveReport(report.id, 'dismiss')}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-black rounded-xl transition-all"
                              >
                                IGNORAR
                              </button>
                              <button 
                                onClick={() => handleResolveReport(report.id, 'delete_meme')}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black rounded-xl shadow-lg shadow-red-900/20 transition-all"
                              >
                                EXCLUIR CONTEÚDO
                              </button>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="py-20 text-center">
                          <div className="w-16 h-16 bg-zinc-950 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-800">
                            <CheckCircle2 className="w-8 h-8" />
                          </div>
                          <p className="text-zinc-500 italic font-bold uppercase text-[10px]">Tudo limpo! Nenhuma denúncia pendente.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 shadow-lg shadow-green-900/10">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black italic uppercase">Status do Servidor</h3>
                        <p className="text-xs text-zinc-500 font-bold uppercase">Monitoramento em tempo real</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center">
                        <p className="text-2xl font-black text-green-500">{memes.length}</p>
                        <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest mt-1">Total de Memes</p>
                      </div>
                      <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center">
                        <p className="text-2xl font-black text-red-500">{adminReports.length}</p>
                        <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest mt-1">Alertas Ativos</p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-4 px-2">Logs Recentes</h4>
                      <div className="space-y-2">
                        <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/50 flex items-center gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Sistema • 100% Estável</p>
                        </div>
                        <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/50 flex items-center gap-3">
                          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
                          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">Backup Realizado • 04:00 AM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {filteredMemes.map((meme) => (
                    <MemeCard 
                      key={meme.id} 
                      meme={meme} 
                      user={user} 
                      rewardRules={rewardRules}
                      onAuthRequired={() => {
                        setAuthMode('login');
                        setIsAuthOpen(true);
                      }} 
                      onUpdate={() => fetchMemes()}
                      onOpenDetails={(m: Meme) => setSelectedMeme(m)}
                      onProfileSelect={(uid) => {
                        setSelectedProfileId(uid);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                ))}
              </div>
            )}

            {!isAdminPanelOpen && filteredMemes.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-700"><Search className="w-8 h-8" /></div>
                <p className="text-zinc-500 italic font-medium">Nenhum conteúdo encontrado com esses critérios.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isPosting && (
          <PostModal 
            onClose={() => setIsPosting(false)} 
            user={user} 
            setError={setError}
            onSuccess={() => {
              fetchMemes();
              setIsPosting(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedMeme && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/90 backdrop-blur-md" 
              onClick={() => setSelectedMeme(null)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-5xl bg-zinc-900 sm:rounded-[32px] overflow-hidden shadow-2xl border-x border-t sm:border border-zinc-800 max-h-[95vh] flex flex-col md:flex-row mt-auto sm:my-auto"
            >
              <button 
                onClick={() => setSelectedMeme(null)} 
                className="absolute top-4 sm:top-6 right-4 sm:right-6 p-2 bg-black/60 backdrop-blur-md text-zinc-400 hover:text-white rounded-full z-20 transition-all active:scale-90"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <div className="flex flex-col md:flex-row h-full w-full overflow-y-auto sm:overflow-hidden no-scrollbar">
                <div className="w-full md:w-[60%] bg-black flex items-center justify-center min-h-[350px] sm:min-h-0 relative select-none">
                  {selectedMeme.fileType === 'image' ? (
                    <img src={selectedMeme.fileUrl} className="max-w-full max-h-[70vh] md:max-h-full object-contain" referrerPolicy="no-referrer" alt={selectedMeme.title} />
                  ) : selectedMeme.fileType === 'video' ? (
                    <video src={selectedMeme.fileUrl} controls className="max-w-full max-h-[70vh] md:max-h-full" playsInline />
                  ) : (
                    <div className="flex flex-col items-center gap-6 p-12">
                      <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                        <Mic className="w-10 h-10 text-green-500" />
                      </div>
                      <audio src={selectedMeme.fileUrl} controls className="w-full max-w-sm sm:max-w-md" />
                    </div>
                  )}
                </div>

                <div className="w-full md:w-[40%] p-6 sm:p-8 flex flex-col bg-zinc-900 border-t md:border-t-0 md:border-l border-zinc-800">
                  <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black italic uppercase leading-none tracking-tight text-white mb-2 font-display">{selectedMeme.title}</h2>
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest bg-zinc-950 px-2.5 py-1 rounded-lg">By: {selectedMeme.author}</p>
                        <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                        <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">{selectedMeme.views} Views</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedMeme.tags.map(t => (
                        <span key={t} className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors cursor-default">#{t}</span>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3" />
                          Contexto
                        </h4>
                        <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
                          <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed font-medium italic">
                            {selectedMeme.description || 'Nenhum contexto adicional fornecido pelo transmissor.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-zinc-800/40 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 p-0.5 rounded-xl shadow-lg shadow-green-900/10 transition-transform hover:scale-105 active:scale-95 cursor-pointer">
                          <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-green-500" />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <p className="text-[10px] font-black uppercase text-white tracking-tight flex items-center flex-wrap gap-1.5">
                            {selectedMeme.postedBy}
                            {selectedMeme.badge_text && (
                              <span className="px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase text-black shrink-0" style={{ backgroundColor: selectedMeme.badge_color || '#22c55e' }}>
                                {selectedMeme.badge_text}
                              </span>
                            )}
                            {getFameBadges(selectedMeme, rewardRules).map((badge, idx) => (
                              <motion.span 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={idx}
                                className="px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase border bg-zinc-950 shrink-0 shadow-lg transition-all"
                                style={{ borderColor: badge.color + '40', color: badge.color, boxShadow: `0 0 15px ${badge.color}15` }}
                              >
                                {badge.text}
                              </motion.span>
                            ))}
                          </p>
                          <p className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(selectedMeme.postedAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-zinc-800/50 flex flex-wrap items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 mr-auto">
                      {user && (user.id === selectedMeme.postedById || user.role === 'admin') && (
                        <button 
                          onClick={() => handleDeleteMeme(selectedMeme.id)}
                          className="p-3.5 bg-zinc-800 text-zinc-500 hover:bg-red-500 hover:text-white transition-all rounded-2xl active:scale-90"
                          title="Excluir Definitivamente"
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (!user) {
                            setAuthMode('login');
                            setIsAuthOpen(true);
                            return;
                          }
                          setReportingMeme(selectedMeme);
                        }}
                        className="p-3.5 bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-red-400 transition-all rounded-2xl active:scale-90"
                        title="Reportar"
                      >
                        <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => {
                        const url = `${window.location.origin}/?meme=${selectedMeme.id}`;
                        navigator.clipboard.writeText(url).then(() => {
                          setIsCopied(true);
                          setTimeout(() => setIsCopied(false), 2000);
                        });
                      }}
                      className="flex-1 min-w-[140px] bg-green-600 hover:bg-green-500 text-white py-3.5 sm:py-4 px-6 rounded-2xl font-black uppercase italic tracking-widest shadow-xl shadow-green-900/30 transition-all active:scale-95 text-[10px] sm:text-xs relative overflow-hidden group"
                    >
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                      <AnimatePresence mode="wait">
                        {isCopied ? (
                          <motion.span 
                            key="copied"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            LINK COPIADO
                          </motion.span>
                        ) : (
                          <motion.span 
                            key="share"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="flex items-center justify-center gap-2"
                          >
                            COMPARTILHAR
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {reportingMeme && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bg-zinc-900 rounded-[32px] p-8 w-full max-w-md border border-zinc-800"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
                  <Flag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black italic uppercase text-red-500">Reportar Conteúdo</h3>
                  <p className="text-[8px] font-bold uppercase text-zinc-600 tracking-widest">Base de Proteção OPMGG</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2 block ml-2">Qual o problema com esta publicação?</label>
                  <textarea 
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Descreva brevemente o motivo da denúncia..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-sm font-bold focus:ring-2 focus:ring-red-500 resize-none outline-none text-zinc-200 placeholder:text-zinc-700"
                    rows={4}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setReportingMeme(null)}
                  className="flex-1 p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleReport}
                  className="flex-1 p-4 bg-red-600 hover:bg-red-500 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-900/10 transition-all active:scale-95"
                >
                  Confirmar Reporte
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTutorialOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 max-w-md w-full rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden"
            >
                    <div className="absolute top-8 left-0 w-full h-1 bg-zinc-800">
                <motion.div 
                  className="h-full bg-green-500" 
                  initial={{ width: '0%' }} 
                  animate={{ width: `${((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100}%` }} 
                />
              </div>

              <div className="mb-8">
                <p className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-2">Tutorial {tutorialStep + 1} / {TUTORIAL_STEPS.length}</p>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-4 text-white font-display">{TUTORIAL_STEPS[tutorialStep].title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                  {TUTORIAL_STEPS[tutorialStep].content}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                {tutorialStep > 0 ? (
                  <button onClick={() => setTutorialStep(s => s - 1)} className="p-4 bg-zinc-800 rounded-2xl text-zinc-500 hover:text-white transition-colors">Voltar</button>
                ) : <div />}

                {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                  <button onClick={() => setTutorialStep(s => s + 1)} className="flex-1 p-4 bg-green-600 hover:bg-green-500 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-green-900/20">Próximo</button>
                ) : (
                  <button onClick={() => setIsTutorialOpen(false)} className="flex-1 p-4 bg-green-600 hover:bg-green-500 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-green-900/20">Entendi!</button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
