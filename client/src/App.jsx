import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [exerciseCount, setExerciseCount] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/exercises')
      .then(res => res.json())
      .then(data => setExerciseCount(data.length))
      .catch(err => setError(err.message))
  }, [])

  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1>simple-gym</h1>
      {error && <p style={{ color: 'red' }}>API error: {error}</p>}
      {exerciseCount !== null && (
        <p>{exerciseCount} exercises loaded from API</p>
      )}
      {exerciseCount === null && !error && <p>Loading...</p>}
    </div>
  )
}

export default App
