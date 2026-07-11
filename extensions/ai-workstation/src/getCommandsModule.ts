function getCommandsModule({ commandsManager, servicesManager }) {
  return {
    definitions: {
      runAiTool: {
        commandFn: async ({ tool, studyUID }) => {
          const Parse = await import('parse').then(m => m.default || m);
          // Use the shared Parse instance from the InterpretationsPanel pattern
          if (!Parse.applicationId) {
            Parse.initialize('2aa9a978-cae0-4a8d-96f6-036ab4aa13c7');
            Parse.serverURL = 'https://imagen.hospitalrealsanlucas.com.mx/server';
          }
          try {
            const result = await Parse.Cloud.run('aiOhifTools', { tool, studyUID });
            return { success: true, data: result };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
      },
    },
  };
}

export default getCommandsModule;
