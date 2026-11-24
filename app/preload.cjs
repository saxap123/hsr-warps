const {contextBridge,ipcRenderer}=require('electron');
// The page never sees the full history link and never calls the API itself.
contextBridge.exposeInMainWorld('desktop',Object.freeze({
 smoke:process.argv.includes('--hsrw-smoke'),
 ready:report=>ipcRenderer.send('hsrw-ready',report),
 state:()=>ipcRenderer.invoke('hsrw-state'),
 find:()=>ipcRenderer.invoke('hsrw-find'),
 update:options=>ipcRenderer.invoke('hsrw-update',options?.useFound===true?{useFound:true}:{url:String(options?.url??'')}),
 cancel:()=>ipcRenderer.invoke('hsrw-cancel'),
 load:uid=>ipcRenderer.invoke('hsrw-load',String(uid??'')),
 settings:patch=>ipcRenderer.invoke('hsrw-settings',patch&&typeof patch==='object'?patch:{}),
 importFile:()=>ipcRenderer.invoke('hsrw-import'),
 exportFile:(uid,format)=>ipcRenderer.invoke('hsrw-export',{uid:String(uid??''),format:format==='uigf'?'uigf':'srgf'}),
 archiver:choose=>ipcRenderer.invoke('hsrw-archiver',{choose:!!choose}),
 openData:()=>ipcRenderer.invoke('hsrw-open-data'),
 onProgress:callback=>{const h=(_e,p)=>callback(p);ipcRenderer.on('hsrw-progress',h);return ()=>ipcRenderer.removeListener('hsrw-progress',h);}
}));
