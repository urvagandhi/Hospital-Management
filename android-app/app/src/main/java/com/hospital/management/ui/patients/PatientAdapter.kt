package com.hospital.management.ui.patients

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.data.models.Patient
import com.hospital.management.R
import com.hospital.management.databinding.ItemPatientBinding
import java.text.SimpleDateFormat
import java.util.Locale

class PatientAdapter(
    private var patients: List<Patient>,
    private val onPatientClick: (Patient) -> Unit
) : RecyclerView.Adapter<PatientAdapter.PatientViewHolder>(), android.widget.Filterable {

    private var patientsFiltered: List<Patient> = patients

    fun updateList(newPatients: List<Patient>) {
        val diffCallback = PatientDiffCallback(patientsFiltered, newPatients)
        val diffResult = DiffUtil.calculateDiff(diffCallback)
        patients = newPatients
        patientsFiltered = newPatients
        diffResult.dispatchUpdatesTo(this)
    }

    override fun getFilter(): android.widget.Filter {
        return object : android.widget.Filter() {
            override fun performFiltering(constraint: CharSequence?): FilterResults {
                val charString = constraint?.toString() ?: ""
                patientsFiltered = if (charString.isEmpty()) {
                    patients
                } else {
                    patients.filter { row ->
                        row.patientName.lowercase().contains(charString.lowercase()) ||
                            row.medicalRecordNumber.contains(charString)
                    }
                }
                val filterResults = FilterResults()
                filterResults.values = patientsFiltered
                return filterResults
            }

            @Suppress("UNCHECKED_CAST")
            override fun publishResults(constraint: CharSequence?, results: FilterResults?) {
                val old = patientsFiltered
                val new = results?.values as? List<Patient> ?: emptyList()
                val diffResult = DiffUtil.calculateDiff(PatientDiffCallback(old, new))
                patientsFiltered = new
                diffResult.dispatchUpdatesTo(this@PatientAdapter)
            }
        }
    }

    inner class PatientViewHolder(private val binding: ItemPatientBinding) :
        RecyclerView.ViewHolder(binding.root) {

        private val avatarColors = intArrayOf(
            0xFF2563EB.toInt(), // blue
            0xFF7C3AED.toInt(), // violet
            0xFF0891B2.toInt(), // cyan
            0xFF059669.toInt(), // emerald
            0xFFD97706.toInt(), // amber
            0xFFE11D48.toInt(), // rose
            0xFF4F46E5.toInt(), // indigo
            0xFF0D9488.toInt(), // teal
        )

        fun bind(patient: Patient) {
            binding.tvPatientName.text = patient.patientName
            binding.tvMrn.text = "MRN: ${patient.medicalRecordNumber}"
            binding.tvPhone.text = patient.phone

            // Two-letter initials: first letter of first name + first letter of last name
            val parts = patient.patientName.trim().split("\\s+".toRegex())
            binding.tvInitials.text = when {
                parts.size >= 2 -> "${parts.first().first()}${parts.last().first()}".uppercase()
                parts.isNotEmpty() && parts[0].isNotEmpty() -> parts[0].first().toString().uppercase()
                else -> "?"
            }

            // Assign a consistent color based on patient name hash
            val colorIndex = (patient.patientName.hashCode().and(0x7FFFFFFF)) % avatarColors.size
            binding.cvAvatar.setCardBackgroundColor(avatarColors[colorIndex])

            binding.root.setOnClickListener {
                onPatientClick(patient)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PatientViewHolder {
        val binding = ItemPatientBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return PatientViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PatientViewHolder, position: Int) {
        holder.bind(patientsFiltered[position])
    }

    override fun getItemCount() = patientsFiltered.size

    private class PatientDiffCallback(
        private val oldList: List<Patient>,
        private val newList: List<Patient>
    ) : DiffUtil.Callback() {
        override fun getOldListSize() = oldList.size
        override fun getNewListSize() = newList.size
        override fun areItemsTheSame(oldPos: Int, newPos: Int) =
            oldList[oldPos]._id == newList[newPos]._id
        override fun areContentsTheSame(oldPos: Int, newPos: Int) =
            oldList[oldPos] == newList[newPos]
    }
}
