import { createSlice } from '@reduxjs/toolkit';

interface IProjectModalState {
  isProjectModalOpen: boolean;
}

const initialState: IProjectModalState = {
  isProjectModalOpen: false,
};

const projectModalSlice = createSlice({
  name: 'projectModal',
  initialState,
  reducers: {
    toggleProjectModal: state => {
      state.isProjectModalOpen = !state.isProjectModalOpen;
    },
  },
});

export const { toggleProjectModal } = projectModalSlice.actions;

export default projectModalSlice.reducer; 