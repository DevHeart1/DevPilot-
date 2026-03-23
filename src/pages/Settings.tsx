import React, { useState } from 'react';

interface UserConfig {
  targetAppBaseUrl: string;
  gitlabDefaultBranch: string;
}

export const Settings = ({
  onBack,
  userConfig,
  onUpdateConfig
}: {
  onBack: () => void;
  userConfig: UserConfig;
  onUpdateConfig: (config: UserConfig) => void;
}) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaved, setIsSaved] = useState(false);
  const [tempConfig, setTempConfig] = useState(userConfig);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(tempConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleReset = () => {
    // In a real app, these would come from an originalEnv object or similar.
    // For now, we just clear localStorage and let App.tsx re-initialize from config.
    // However, since we're in-flight, we'll just set it to the initial defaults.
    const defaults = {
      targetAppBaseUrl: "http://localhost:3000",
      gitlabDefaultBranch: "main"
    };
    setTempConfig(defaults);
    onUpdateConfig(defaults);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="min-h-screen bg-background-dark text-slate-100 font-display">
      <header className="flex items-center px-6 py-4 border-b border-border-subtle bg-background-dark/50 sticky top-0 z-50">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-medium">Back to Dashboard</span>
        </button>
      </header>
      <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-12">
        <aside className="w-full md:w-64 shrink-0">
          <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
          <nav className="space-y-1">
            <button onClick={() => setActiveTab('profile')} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'profile' ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>Profile</button>
            <button onClick={() => setActiveTab('account')} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'account' ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>Account</button>
            <button onClick={() => setActiveTab('notifications')} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'notifications' ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>Notifications</button>
            <button onClick={() => setActiveTab('integrations')} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'integrations' ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>Integrations</button>
          </nav>
        </aside>
        <main className="flex-1 max-w-2xl">
          {activeTab === 'profile' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Public Profile</h3>
                <p className="text-sm text-slate-400 mb-8">This information will be displayed publicly so be careful what you share.</p>

                <form onSubmit={handleSave} className="space-y-8">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-4">Avatar</label>
                    <div className="flex items-center gap-6">
                      <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-primary to-orange-200 border-2 border-surface-dark shadow-lg"></div>
                      <div className="flex gap-3">
                        <button type="button" className="px-4 py-2 bg-surface-dark border border-border-subtle rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">Change</button>
                        <button type="button" className="px-4 py-2 text-sm font-medium text-rose-500 hover:text-rose-400 transition-colors">Remove</button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">First Name</label>
                      <input required type="text" defaultValue="Alex" className="w-full bg-surface-dark border border-border-subtle rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Last Name</label>
                      <input required type="text" defaultValue="Developer" className="w-full bg-surface-dark border border-border-subtle rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Bio</label>
                    <textarea rows={4} defaultValue="Building the future of automated development." className="w-full bg-surface-dark border border-border-subtle rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"></textarea>
                    <p className="text-xs text-slate-500 mt-2">Brief description for your profile. URLs are hyperlinked.</p>
                  </div>

                  <div className="pt-6 border-t border-border-subtle flex items-center justify-between">
                    {isSaved ? (
                      <span className="text-emerald-500 text-sm font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Saved successfully
                      </span>
                    ) : <span></span>}
                    <button type="submit" className="px-6 py-2.5 bg-primary text-background-dark font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Email Notifications</h3>
                <p className="text-sm text-slate-400 mb-8">Choose what updates you want to receive via email.</p>

                <div className="space-y-4">
                  {[
                    { title: 'Task Completed', desc: 'Get notified when an automated task finishes execution.', defaultChecked: true },
                    { title: 'PR Reviews', desc: 'Get notified when DevPilot submits a PR review.', defaultChecked: true },
                    { title: 'Weekly Digest', desc: 'Receive a weekly summary of automated tasks and time saved.', defaultChecked: false },
                    { title: 'Security Alerts', desc: 'Critical notifications about your connected repositories.', defaultChecked: true }
                  ].map((item, i) => (
                    <div key={i} className="flex items-start justify-between p-5 rounded-xl border border-border-subtle bg-surface/30 hover:border-slate-600 transition-colors">
                      <div className="pr-8">
                        <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{item.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                        <input type="checkbox" className="sr-only peer" defaultChecked={item.defaultChecked} />
                        <div className="w-11 h-6 bg-surface-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-border-subtle peer-checked:border-primary"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Account Security</h3>
                <p className="text-sm text-slate-400 mb-8">Manage your password and 2FA settings.</p>

                <div className="p-5 rounded-xl border border-border-subtle bg-surface/30 flex items-center justify-between mb-12">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Two-factor Authentication</h4>
                    <p className="text-xs text-slate-400 mt-1">Add an extra layer of security to your account.</p>
                  </div>
                  <button className="px-4 py-2 bg-surface-dark border border-border-subtle rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">Enable 2FA</button>
                </div>

                <h3 className="text-xl font-bold text-rose-500 mb-1">Danger Zone</h3>
                <p className="text-sm text-slate-400 mb-6">Irreversible actions for your account.</p>

                <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-500/5">
                  <h4 className="text-base font-semibold text-rose-500">Delete Account</h4>
                  <p className="text-sm text-slate-400 mt-2 mb-6">Once you delete your account, there is no going back. All your automated tasks, logs, and settings will be permanently removed.</p>
                  <button className="px-5 py-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-sm font-bold hover:bg-rose-500/20 transition-colors">Delete Account</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Project Runtime</h3>
                <p className="text-sm text-slate-400 mb-8">Configure your application details and repository defaults.</p>

                <form onSubmit={handleSave} className="space-y-6">
                  <div className="p-6 rounded-2xl border border-border-subtle bg-surface/30 space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Target Application URL</label>
                      <input
                        type="url"
                        value={tempConfig.targetAppBaseUrl}
                        onChange={(e) => setTempConfig({ ...tempConfig, targetAppBaseUrl: e.target.value })}
                        placeholder="http://localhost:3000"
                        className="w-full bg-surface-dark border border-border-subtle rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">The base URL of the app DevPilot will interact with.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">GitLab Default Branch</label>
                      <input
                        type="text"
                        value={tempConfig.gitlabDefaultBranch}
                        onChange={(e) => setTempConfig({ ...tempConfig, gitlabDefaultBranch: e.target.value })}
                        placeholder="main"
                        className="w-full bg-surface-dark border border-border-subtle rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">Fallback branch used for listing files and creating MRs.</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Reset to Defaults
                    </button>
                    <div className="flex items-center gap-4">
                      {isSaved && (
                        <span className="text-emerald-500 text-sm font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Saved
                        </span>
                      )}
                      <button type="submit" className="px-6 py-2.5 bg-primary text-background-dark font-bold rounded-lg hover:bg-primary/90 transition-colors">
                        Save Runtime Config
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-1">Connected Apps</h3>
                <p className="text-sm text-slate-400 mb-8">Manage services connected to your DevPilot account.</p>

                <div className="space-y-4 opacity-50 pointer-events-none">
                  <div className="flex items-center justify-between p-5 rounded-xl border border-border-subtle bg-surface/30">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-white flex items-center justify-center">
                        <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub" className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">GitHub</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Connected as @alexdev</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 text-sm font-medium text-slate-400">Disconnect</button>
                  </div>

                  <div className="flex items-center justify-between p-5 rounded-xl border border-border-subtle bg-surface/30">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-[#E50914] flex items-center justify-center text-white font-bold text-xl">
                        G
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">GitLab</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Active via Token</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-surface-dark border border-border-subtle rounded-lg text-sm font-medium">Configured</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
